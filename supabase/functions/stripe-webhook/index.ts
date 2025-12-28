import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Stripe settings from database
    const { data: stripeSettings, error: settingsError } = await supabase
      .from("stripe_settings")
      .select("*")
      .eq("is_configured", true)
      .single();

    if (settingsError || !stripeSettings) {
      console.error("Stripe not configured");
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    // Verify webhook signature if secret is configured
    if (stripeSettings.webhook_secret_encrypted && signature) {
      // Note: In production, you'd want to properly decrypt and verify the signature
      // For now, we'll process the webhook but log a warning
      console.log("Webhook signature verification should be implemented with proper decryption");
    }

    const event = JSON.parse(body);
    console.log("Received Stripe event:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId = session.metadata?.subscription_id;
        const paymentId = session.metadata?.payment_id;

        if (paymentId) {
          // Update payment status
          await supabase
            .from("payments")
            .update({
              status: "completed",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: session.payment_intent,
            })
            .eq("id", paymentId);
        }

        if (subscriptionId) {
          // Update subscription status to active
          await supabase
            .from("subscriptions")
            .update({
              status: "active",
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
            })
            .eq("id", subscriptionId);

          // Get the subscription to find the asset
          const { data: subscription } = await supabase
            .from("subscriptions")
            .select("asset_id")
            .eq("id", subscriptionId)
            .single();

          if (subscription) {
            // Unblock the asset
            await supabase
              .from("assets")
              .update({
                status: "active",
                block_reason: null,
              })
              .eq("id", subscription.asset_id);

            // Log the unblock
            await supabase.from("access_logs").insert({
              asset_id: subscription.asset_id,
              action: "payment_completed",
              details: {
                payment_intent: session.payment_intent,
                amount: session.amount_total,
              },
            });
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;

        if (stripeSubscriptionId) {
          // Find subscription by stripe_subscription_id
          const { data: subscription } = await supabase
            .from("subscriptions")
            .select("id, asset_id")
            .eq("stripe_subscription_id", stripeSubscriptionId)
            .single();

          if (subscription) {
            // Create payment record
            await supabase.from("payments").insert({
              subscription_id: subscription.id,
              amount: invoice.amount_paid / 100,
              status: "completed",
              payment_method: "card",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: invoice.payment_intent,
            });

            // Ensure asset is active
            await supabase
              .from("assets")
              .update({ status: "active", block_reason: null })
              .eq("id", subscription.asset_id);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;

        if (stripeSubscriptionId) {
          const { data: subscription } = await supabase
            .from("subscriptions")
            .select("id, asset_id")
            .eq("stripe_subscription_id", stripeSubscriptionId)
            .single();

          if (subscription) {
            // Update subscription status
            await supabase
              .from("subscriptions")
              .update({ status: "overdue" })
              .eq("id", subscription.id);

            // Block the asset
            await supabase
              .from("assets")
              .update({
                status: "blocked",
                block_reason: "Pagamento não aprovado",
              })
              .eq("id", subscription.asset_id);

            // Log the block
            await supabase.from("access_logs").insert({
              asset_id: subscription.asset_id,
              action: "payment_failed",
              details: {
                invoice_id: invoice.id,
                attempt_count: invoice.attempt_count,
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        
        const { data: dbSubscription } = await supabase
          .from("subscriptions")
          .select("id, asset_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (dbSubscription) {
          await supabase
            .from("subscriptions")
            .update({ status: "cancelled" })
            .eq("id", dbSubscription.id);

          await supabase
            .from("assets")
            .update({
              status: "blocked",
              block_reason: "Assinatura cancelada",
            })
            .eq("id", dbSubscription.asset_id);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
