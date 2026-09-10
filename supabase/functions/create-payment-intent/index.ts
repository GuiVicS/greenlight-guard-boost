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

    const { subscriptionId, paymentMethod, saveCardForAutoCharge = false } = await req.json();

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
          checkout_mode,
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

    // Determine payment methods and currency based on the asset checkout mode (global = USD/card only)
    const isGlobalCheckout = subscription.asset?.checkout_mode === "global";
    const country = isGlobalCheckout ? "US" : (subscription.country || "BR");
    const countryConfig: Record<string, { currency: string; methods: string[] }> = {
      BR: { currency: "brl", methods: paymentMethod === "boleto" ? ["boleto"] : ["card"] },
      US: { currency: "usd", methods: ["card"] },
      PT: { currency: "eur", methods: ["card"] },
      ES: { currency: "eur", methods: ["card"] },
      MX: { currency: "mxn", methods: paymentMethod === "oxxo" ? ["oxxo"] : ["card"] },
    };

    const config = countryConfig[country] || countryConfig.BR;

    // Get or create Stripe customer for saving payment method
    let stripeCustomerId = subscription.stripe_customer_id;
    
    if (saveCardForAutoCharge && paymentMethod === "card" && !stripeCustomerId) {
      // Create Stripe customer
      const customerParams = new URLSearchParams({
        email: subscription.asset?.client?.email || "",
        name: subscription.asset?.client?.name || "",
        "metadata[subscription_id]": subscriptionId,
        "metadata[asset_id]": subscription.asset?.id || "",
      });

      const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSettings.secret_key_encrypted}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: customerParams,
      });

      const customer = await customerResponse.json();
      
      if (customer.error) {
        console.error("Error creating Stripe customer:", customer.error);
      } else {
        stripeCustomerId = customer.id;
        
        // Save customer ID to subscription
        await supabase
          .from("subscriptions")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", subscriptionId);
          
        console.log("Created Stripe customer:", stripeCustomerId);
      }
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

    // Create PaymentIntent
    const params = new URLSearchParams({
      amount: String(amountInCents),
      currency: config.currency,
      "metadata[subscription_id]": subscriptionId,
      "metadata[payment_id]": payment.id,
      "metadata[asset_id]": subscription.asset?.id || "",
      description: `${subscription.plan_name} - ${subscription.asset?.name}`,
    });

    // Add payment method types
    config.methods.forEach(method => {
      params.append("payment_method_types[]", method);
    });

    // If saving card for auto charge, add customer and setup_future_usage
    if (saveCardForAutoCharge && paymentMethod === "card" && stripeCustomerId) {
      params.append("customer", stripeCustomerId);
      params.append("setup_future_usage", "off_session");
    }

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
      await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);

      const code = paymentIntent.error.code || "";
      const raw = paymentIntent.error.message || "Erro ao iniciar o pagamento";
      const isBR = country === "BR";
      let friendly = raw;
      if (code === "amount_too_small") {
        friendly = isBR
          ? "O valor da cobrança é menor que o mínimo aceito pelo cartão/boleto (R$ 5,00). Ajuste o valor da assinatura."
          : "The amount is below the minimum accepted by the payment provider.";
      } else if (code === "amount_too_large") {
        friendly = isBR ? "O valor da cobrança excede o máximo permitido." : "The amount exceeds the maximum allowed.";
      }

      return new Response(
        JSON.stringify({ error: friendly, code }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
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
