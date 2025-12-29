import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { subscriptionId, assetId } = await req.json();

    if (!subscriptionId || !assetId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Unlocking asset after payment:", { subscriptionId, assetId });

    // Check if there's a completed payment for this subscription
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("subscription_id", subscriptionId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If we don't have a completed payment yet, check for a recent pending payment
    // This handles the case where the Stripe payment succeeded but webhook hasn't processed yet
    const { data: pendingPayment } = await supabase
      .from("payments")
      .select("id, status, stripe_payment_intent_id")
      .eq("subscription_id", subscriptionId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let shouldUnlock = !!payment;

    // If we have a pending payment with a payment intent, check its status with Stripe
    if (!shouldUnlock && pendingPayment?.stripe_payment_intent_id) {
      // Get Stripe settings
      const { data: stripeSettings } = await supabase
        .from("stripe_settings")
        .select("secret_key_encrypted")
        .eq("is_configured", true)
        .single();

      if (stripeSettings?.secret_key_encrypted) {
        try {
          const stripeResponse = await fetch(
            `https://api.stripe.com/v1/payment_intents/${pendingPayment.stripe_payment_intent_id}`,
            {
              headers: {
                "Authorization": `Bearer ${stripeSettings.secret_key_encrypted}`,
              },
            }
          );
          
          const paymentIntent = await stripeResponse.json();
          console.log("Payment intent status:", paymentIntent.status);

          if (paymentIntent.status === "succeeded") {
            shouldUnlock = true;
            
            // Update the payment to completed since we confirmed it with Stripe
            await supabase
              .from("payments")
              .update({
                status: "completed",
                paid_at: new Date().toISOString(),
              })
              .eq("id", pendingPayment.id);
            
            console.log("Payment marked as completed:", pendingPayment.id);
          }
        } catch (stripeError) {
          console.error("Error checking Stripe payment intent:", stripeError);
        }
      }
    }

    if (shouldUnlock) {
      // Update subscription status to active
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", subscriptionId);

      if (subError) {
        console.error("Error updating subscription:", subError);
      } else {
        console.log("Subscription updated to active:", subscriptionId);
      }

      // Unblock the asset
      const { error: assetError } = await supabase
        .from("assets")
        .update({
          status: "active",
          block_reason: null,
        })
        .eq("id", assetId);

      if (assetError) {
        console.error("Error unblocking asset:", assetError);
      } else {
        console.log("Asset unblocked:", assetId);
      }

      // Log the unblock
      await supabase.from("access_logs").insert({
        asset_id: assetId,
        action: "payment_completed_unlock",
        details: {
          subscription_id: subscriptionId,
          unlocked_at: new Date().toISOString(),
        },
      });

      return new Response(
        JSON.stringify({ success: true, unlocked: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.log("No completed payment found, not unlocking");
      return new Response(
        JSON.stringify({ success: true, unlocked: false, message: "No completed payment found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});