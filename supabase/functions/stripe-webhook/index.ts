import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FAILED_ATTEMPTS = 3;

// Verify Stripe signature (HMAC-SHA256 over `${timestamp}.${body}`)
async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = signatureHeader.split(",").map((p) => p.trim());
    const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
    const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));

    if (!timestamp || signatures.length === 0) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${body}`),
    );

    const expected = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return signatures.some((sig) => sig === expected);
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

// Re-check invoice status directly with Stripe to avoid out-of-order events
// Dispatch outbound webhook event to configured endpoints
async function dispatchWebhook(
  supabase: any,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.functions.invoke("webhook-dispatcher", {
      body: { event, data: payload },
    });
  } catch (e) {
    console.error(`[stripe-webhook] Failed to dispatch ${event}:`, e);
  }
}

async function fetchInvoiceStatus(
  invoiceId: string,
  secretKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const invoice = await res.json();
    return invoice?.status ?? null;
  } catch (e) {
    console.error("Error fetching invoice from Stripe:", e);
    return null;
  }
}

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

    // Signature validation (mandatory when a signing secret is configured)
    if (stripeSettings.webhook_secret_encrypted) {
      if (!signature) {
        console.error("Missing stripe-signature header");
        return new Response(
          JSON.stringify({ error: "Missing signature" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const valid = await verifyStripeSignature(
        body,
        signature,
        stripeSettings.webhook_secret_encrypted,
      );

      if (!valid) {
        console.error("Invalid Stripe webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    } else {
      console.warn("No webhook signing secret configured - signature not validated");
    }

    const event = JSON.parse(body);
    console.log("Received Stripe event:", event.type, event.id);

    // Idempotency: register the event id, ignore replays
    if (event.id) {
      const { error: dedupeError } = await supabase
        .from("stripe_webhook_events")
        .insert({ stripe_event_id: event.id, event_type: event.type });

      if (dedupeError) {
        if (dedupeError.code === "23505") {
          console.log("Duplicate event ignored:", event.id);
          return new Response(
            JSON.stringify({ received: true, duplicate: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("Error recording webhook event:", dedupeError);
      }
    }

    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const subscriptionId = paymentIntent.metadata?.subscription_id;
        const paymentId = paymentIntent.metadata?.payment_id;
        const assetId = paymentIntent.metadata?.asset_id;

        console.log("PaymentIntent succeeded:", paymentIntent.id, { subscriptionId, paymentId, assetId });

        if (paymentId) {
          const { error: paymentError } = await supabase
            .from("payments")
            .update({
              status: "completed",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntent.id,
            })
            .eq("id", paymentId);

          if (paymentError) console.error("Error updating payment:", paymentError);
        }

        if (subscriptionId) {
          const updateData: Record<string, unknown> = {
            status: "active",
            stripe_customer_id: paymentIntent.customer,
            payment_status: "paid",
            payment_failed_attempts: 0,
            payment_failed_invoice_id: null,
            access_block_reason: null,
            blocked_at: null,
          };

          if (paymentIntent.payment_method && paymentIntent.setup_future_usage === "off_session") {
            updateData.auto_charge_enabled = true;
          }

          const { error: subError } = await supabase
            .from("subscriptions")
            .update(updateData)
            .eq("id", subscriptionId);

          if (subError) console.error("Error updating subscription:", subError);
        }

        if (assetId) {
          await supabase
            .from("assets")
            .update({ status: "active", block_reason: null })
            .eq("id", assetId);

          await supabase.from("access_logs").insert({
            asset_id: assetId,
            action: "payment_completed",
            details: {
              payment_intent: paymentIntent.id,
              amount: paymentIntent.amount,
              payment_method: paymentIntent.payment_method_types?.[0] || "unknown",
            },
          });
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId = session.metadata?.subscription_id;
        const paymentId = session.metadata?.payment_id;

        if (paymentId) {
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
          await supabase
            .from("subscriptions")
            .update({
              status: "active",
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              payment_status: "paid",
              payment_failed_attempts: 0,
              payment_failed_invoice_id: null,
              access_block_reason: null,
              blocked_at: null,
            })
            .eq("id", subscriptionId);

          const { data: subscription } = await supabase
            .from("subscriptions")
            .select("asset_id")
            .eq("id", subscriptionId)
            .single();

          if (subscription) {
            await supabase
              .from("assets")
              .update({ status: "active", block_reason: null })
              .eq("id", subscription.asset_id);

            await supabase.from("access_logs").insert({
              asset_id: subscription.asset_id,
              action: "payment_completed",
              details: {
                payment_intent: session.payment_intent,
                amount: session.amount_total,
              },
            });

            await dispatchWebhook(supabase, "subscription.created", {
              subscription_id: subscriptionId,
              stripe_subscription_id: session.subscription,
              stripe_customer_id: session.customer,
              plan_name: subscription.plan_name,
              amount: session.amount_total ? session.amount_total / 100 : null,
            });
          }
        }
        break;
      }

      // Invoice paid -> always restore access when it was blocked for payment failure
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;
        if (!stripeSubscriptionId) break;

        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("id, asset_id, access_block_reason")
          .eq("stripe_subscription_id", stripeSubscriptionId)
          .maybeSingle();

        if (!subscription) {
          console.log("No local subscription for", stripeSubscriptionId);
          break;
        }

        // Avoid duplicate payment rows for the same invoice payment intent
        if (invoice.payment_intent) {
          const { data: existing } = await supabase
            .from("payments")
            .select("id")
            .eq("stripe_payment_intent_id", invoice.payment_intent)
            .maybeSingle();

          if (!existing) {
            await supabase.from("payments").insert({
              subscription_id: subscription.id,
              amount: (invoice.amount_paid ?? 0) / 100,
              status: "completed",
              payment_method: "card",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: invoice.payment_intent,
            });
          }
        }

        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            payment_status: "paid",
            payment_failed_attempts: 0,
            payment_failed_invoice_id: null,
            access_block_reason: null,
            blocked_at: null,
          })
          .eq("id", subscription.id);

        // Only auto-unblock when the block came from payment failure (or no reason recorded)
        const reason = subscription.access_block_reason;
        if (!reason || reason === "payment_failed") {
          await supabase
            .from("assets")
            .update({ status: "active", block_reason: null })
            .eq("id", subscription.asset_id);
        }

        await supabase.from("access_logs").insert({
          asset_id: subscription.asset_id,
          action: "invoice_paid",
          details: { invoice_id: invoice.id, amount_paid: invoice.amount_paid },
        });
        break;
      }

      // Dunning: Stripe retries; we only block from the 3rd failed attempt on
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;
        if (!stripeSubscriptionId) break;

        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("id, asset_id, access_block_reason")
          .eq("stripe_subscription_id", stripeSubscriptionId)
          .maybeSingle();

        if (!subscription) {
          console.log("No local subscription for", stripeSubscriptionId);
          break;
        }

        // Attempts are always taken from the invoice itself (never incremented locally)
        const attemptCount: number = invoice.attempt_count ?? 1;
        const shouldBlock = attemptCount >= MAX_FAILED_ATTEMPTS;

        // Out-of-order protection: confirm the invoice is really unpaid before blocking
        if (shouldBlock && stripeSettings.secret_key_encrypted) {
          const currentStatus = await fetchInvoiceStatus(invoice.id, stripeSettings.secret_key_encrypted);
          if (currentStatus === "paid") {
            console.log("Invoice already paid on Stripe, skipping block:", invoice.id);
            await supabase
              .from("subscriptions")
              .update({
                status: "active",
                payment_status: "paid",
                payment_failed_attempts: 0,
                payment_failed_invoice_id: null,
                access_block_reason: null,
                blocked_at: null,
              })
              .eq("id", subscription.id);
            break;
          }
        }

        await supabase
          .from("subscriptions")
          .update({
            status: shouldBlock ? "overdue" : "active",
            payment_status: shouldBlock ? "blocked" : "past_due",
            payment_failed_attempts: attemptCount,
            payment_failed_invoice_id: invoice.id,
            access_block_reason: shouldBlock ? "payment_failed" : null,
            blocked_at: shouldBlock ? new Date().toISOString() : null,
          })
          .eq("id", subscription.id);

        if (shouldBlock) {
          await supabase
            .from("assets")
            .update({ status: "blocked", block_reason: "Pagamento não aprovado" })
            .eq("id", subscription.asset_id);
        }

        await supabase.from("access_logs").insert({
          asset_id: subscription.asset_id,
          action: shouldBlock ? "payment_failed_blocked" : "payment_failed_grace",
          details: {
            invoice_id: invoice.id,
            attempt_count: attemptCount,
            blocked: shouldBlock,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object;

        const { data: dbSubscription } = await supabase
          .from("subscriptions")
          .select("id, asset_id")
          .eq("stripe_subscription_id", stripeSub.id)
          .maybeSingle();

        if (dbSubscription) {
          await supabase
            .from("subscriptions")
            .update({
              status: "cancelled",
              access_block_reason: "subscription_canceled",
              blocked_at: new Date().toISOString(),
            })
            .eq("id", dbSubscription.id);

          await supabase
            .from("assets")
            .update({ status: "blocked", block_reason: "Assinatura cancelada" })
            .eq("id", dbSubscription.asset_id);

          await supabase.from("access_logs").insert({
            asset_id: dbSubscription.asset_id,
            action: "subscription_canceled",
            details: { stripe_subscription_id: stripeSub.id },
          });
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
