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

    const { subscriptionId, paymentMethod, successUrl, cancelUrl } = await req.json();

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
      return new Response(
        JSON.stringify({ error: "Failed to create payment" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // For now, we'll use Stripe's hosted checkout
    // In production, you'd decrypt the secret key and use it
    const secretKey = stripeSettings.secret_key_encrypted;

    // Create Stripe checkout session
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "payment_method_types[0]": paymentMethod === "pix" ? "pix" : "card",
        "mode": "payment",
        "success_url": successUrl || `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        "cancel_url": cancelUrl || `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/checkout/${subscription.asset?.id}`,
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][product_data][name]": `${subscription.plan_name} - ${subscription.asset?.name}`,
        "line_items[0][price_data][unit_amount]": String(Math.round(subscription.monthly_value * 100)),
        "line_items[0][quantity]": "1",
        "customer_email": subscription.asset?.client?.email || "",
        "metadata[subscription_id]": subscriptionId,
        "metadata[payment_id]": payment.id,
        "metadata[asset_id]": subscription.asset?.id || "",
        ...(paymentMethod === "pix" && { "payment_method_options[pix][expires_after_seconds]": "86400" }),
      }),
    });

    const stripeSession = await stripeResponse.json();

    if (stripeSession.error) {
      console.error("Stripe error:", stripeSession.error);
      return new Response(
        JSON.stringify({ error: stripeSession.error.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Update payment with stripe session id
    await supabase
      .from("payments")
      .update({ stripe_payment_intent_id: stripeSession.id })
      .eq("id", payment.id);

    return new Response(
      JSON.stringify({
        sessionId: stripeSession.id,
        url: stripeSession.url,
        publishableKey: stripeSettings.publishable_key,
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
