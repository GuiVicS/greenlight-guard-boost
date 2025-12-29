import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
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

    const body = await req.json();
    console.log("Received Mercado Pago webhook:", JSON.stringify(body, null, 2));

    // Mercado Pago sends notifications in different formats
    // For IPN (Instant Payment Notification)
    const topic = body.topic || body.type;
    const resourceId = body.data?.id || body.id;

    if (!topic || !resourceId) {
      console.log("Invalid webhook payload");
      return new Response(
        JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only process payment notifications
    if (topic !== "payment" && topic !== "payment.updated" && topic !== "payment.created") {
      console.log(`Ignoring topic: ${topic}`);
      return new Response(
        JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Mercado Pago settings for API access
    const { data: mpSettings, error: mpError } = await supabase
      .from("mercadopago_settings")
      .select("*")
      .eq("is_configured", true)
      .single();

    if (mpError || !mpSettings) {
      console.error("Mercado Pago not configured");
      return new Response(
        JSON.stringify({ error: "Mercado Pago not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const accessToken = mpSettings.is_sandbox 
      ? mpSettings.sandbox_access_token_encrypted 
      : mpSettings.access_token_encrypted;

    // Fetch payment details from Mercado Pago API
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!paymentResponse.ok) {
      console.error("Failed to fetch payment from MP:", await paymentResponse.text());
      return new Response(
        JSON.stringify({ error: "Failed to fetch payment details" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const payment = await paymentResponse.json();
    console.log("Mercado Pago payment details:", JSON.stringify(payment, null, 2));

    const subscriptionId = payment.metadata?.subscription_id;
    const assetId = payment.metadata?.asset_id;
    const returnUrl = payment.metadata?.return_url;

    if (!subscriptionId) {
      console.log("No subscription_id in payment metadata");
      return new Response(
        JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the payment record in our database
    const { data: dbPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("stripe_payment_intent_id", `mp_${resourceId}`)
      .single();

    if (payment.status === "approved") {
      console.log("Payment approved! Processing...");

      // Update payment status
      if (dbPayment) {
        await supabase
          .from("payments")
          .update({
            status: "completed",
            paid_at: new Date().toISOString()
          })
          .eq("id", dbPayment.id);
        console.log("Payment record updated to completed");
      }

      // Update subscription status
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", subscriptionId);

      if (subError) {
        console.error("Error updating subscription:", subError);
      } else {
        console.log("Subscription updated to active");
      }

      // Unblock the asset
      if (assetId) {
        const { error: assetError } = await supabase
          .from("assets")
          .update({
            status: "active",
            block_reason: null
          })
          .eq("id", assetId);

        if (assetError) {
          console.error("Error unblocking asset:", assetError);
        } else {
          console.log("Asset unblocked:", assetId);
        }

        // Log the payment completion
        await supabase.from("access_logs").insert({
          asset_id: assetId,
          action: "payment_completed",
          details: {
            payment_id: resourceId,
            amount: payment.transaction_amount,
            payment_method: "pix",
            gateway: "mercadopago",
            return_url: returnUrl || null
          }
        });
      }
    } else if (payment.status === "rejected" || payment.status === "cancelled") {
      console.log(`Payment ${payment.status}:`, resourceId);

      if (dbPayment) {
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", dbPayment.id);
      }
    } else {
      console.log(`Payment status: ${payment.status}`);
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
