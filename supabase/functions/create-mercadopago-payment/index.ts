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

    const { subscriptionId, customerEmail, customerName, customerDocument, returnUrl } = await req.json();

    if (!subscriptionId) {
      return new Response(
        JSON.stringify({ error: "subscriptionId is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get Mercado Pago settings
    const { data: mpSettings, error: mpError } = await supabase
      .from("mercadopago_settings")
      .select("*")
      .eq("is_configured", true)
      .single();

    if (mpError || !mpSettings) {
      console.error("Mercado Pago not configured:", mpError);
      return new Response(
        JSON.stringify({ error: "Mercado Pago not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get subscription details
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        plan_name,
        monthly_value,
        asset_id,
        assets (id, name, client_id)
      `)
      .eq("id", subscriptionId)
      .single();

    if (subError || !subscription) {
      console.error("Subscription not found:", subError);
      return new Response(
        JSON.stringify({ error: "Subscription not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Determine which access token to use
    const accessToken = mpSettings.is_sandbox 
      ? mpSettings.sandbox_access_token_encrypted 
      : mpSettings.access_token_encrypted;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago access token not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get asset name safely
    const asset = subscription.assets as unknown as { name: string } | null;
    const assetName = asset?.name || "Assinatura";

    // Create payment in Mercado Pago
    const paymentData = {
      transaction_amount: Number(subscription.monthly_value),
      description: `${subscription.plan_name} - ${assetName}`,
      payment_method_id: "pix",
      payer: {
        email: customerEmail,
        first_name: customerName?.split(" ")[0] || "Cliente",
        last_name: customerName?.split(" ").slice(1).join(" ") || "",
        identification: customerDocument ? {
          type: "CPF",
          number: customerDocument.replace(/\D/g, "")
        } : undefined
      },
      metadata: {
        subscription_id: subscriptionId,
        asset_id: subscription.asset_id,
        return_url: returnUrl || ""
      }
    };

    console.log("Creating Mercado Pago payment:", JSON.stringify(paymentData, null, 2));

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${subscriptionId}-${Date.now()}`
      },
      body: JSON.stringify(paymentData)
    });

    const mpResult = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Mercado Pago error:", mpResult);
      return new Response(
        JSON.stringify({ error: mpResult.message || "Failed to create payment", details: mpResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Mercado Pago payment created:", mpResult.id);

    // Create payment record in database
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        subscription_id: subscriptionId,
        amount: subscription.monthly_value,
        status: "pending",
        payment_method: "pix",
        stripe_payment_intent_id: `mp_${mpResult.id}` // Using this field to store MP payment ID
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
    }

    // Extract PIX data
    const pixData = mpResult.point_of_interaction?.transaction_data;

    return new Response(
      JSON.stringify({
        paymentId: mpResult.id,
        dbPaymentId: payment?.id,
        status: mpResult.status,
        qrCode: pixData?.qr_code,
        qrCodeBase64: pixData?.qr_code_base64,
        ticketUrl: pixData?.ticket_url,
        expirationDate: mpResult.date_of_expiration
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error creating Mercado Pago payment:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
