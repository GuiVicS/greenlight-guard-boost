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

    const { subscriptionId, paymentMethod } = await req.json();

    if (!subscriptionId || !paymentMethod) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get Stripe settings
    const { data: stripeSettings, error: settingsError } = await supabase
      .from("stripe_settings")
      .select("*")
      .eq("is_configured", true)
      .single();

    if (settingsError || !stripeSettings?.secret_key_encrypted) {
      console.error("Stripe settings error:", settingsError);
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get subscription with asset and client info
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        *,
        asset:assets (
          id,
          name,
          client:clients (
            id,
            name,
            email
          )
        )
      `)
      .eq("id", subscriptionId)
      .single();

    if (subError || !subscription) {
      console.error("Subscription error:", subError);
      return new Response(
        JSON.stringify({ error: "Subscription not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Create pending payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        subscription_id: subscriptionId,
        amount: subscription.monthly_value,
        status: "pending",
        payment_method: paymentMethod,
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Payment creation error:", paymentError);
      return new Response(
        JSON.stringify({ error: "Failed to create payment" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const secretKey = stripeSettings.secret_key_encrypted;
    const amountInCents = Math.round(subscription.monthly_value * 100);

    // Build payment method types
    const paymentMethodTypes = paymentMethod === "pix" ? "pix" : "card";

    // Create PaymentIntent
    const params = new URLSearchParams({
      amount: String(amountInCents),
      currency: "brl",
      "payment_method_types[]": paymentMethodTypes,
      "metadata[subscription_id]": subscriptionId,
      "metadata[payment_id]": payment.id,
      "metadata[asset_id]": subscription.asset?.id || "",
      description: `${subscription.plan_name} - ${subscription.asset?.name}`,
    });

    // Add receipt email if available
    if (subscription.asset?.client?.email) {
      params.append("receipt_email", subscription.asset.client.email);
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const paymentIntent = await stripeResponse.json();

    if (paymentIntent.error) {
      console.error("Stripe error:", paymentIntent.error);
      return new Response(
        JSON.stringify({ error: paymentIntent.error.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Update payment with stripe payment intent id
    await supabase
      .from("payments")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", payment.id);

    console.log("PaymentIntent created:", paymentIntent.id);

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        publishableKey: stripeSettings.publishable_key,
        paymentId: payment.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
