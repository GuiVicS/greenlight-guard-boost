import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PaymentRequest {
  subscriptionId: string;
  customerEmail: string;
  customerName: string;
  customerDocument?: string;
  paymentMethod?: "pix" | "card" | "boleto";
  returnUrl?: string;
  // Card specific fields
  cardToken?: string;
  installments?: number;
  issuerId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestData: PaymentRequest = await req.json();
    const { 
      subscriptionId, 
      customerEmail, 
      customerName, 
      customerDocument, 
      paymentMethod = "pix",
      returnUrl,
      cardToken,
      installments = 1,
      issuerId
    } = requestData;

    console.log("=== CREATE MERCADOPAGO PAYMENT ===");
    console.log("Payment method:", paymentMethod);
    console.log("Subscription ID:", subscriptionId);

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
        JSON.stringify({ error: "Mercado Pago não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get subscription details with asset and client info
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        plan_name,
        monthly_value,
        asset_id,
        assets!inner (
          id, 
          name, 
          client_id,
          clients!inner (
            id,
            name,
            email,
            phone
          )
        )
      `)
      .eq("id", subscriptionId)
      .single();

    if (subError || !subscription) {
      console.error("Subscription not found:", subError);
      return new Response(
        JSON.stringify({ error: "Assinatura não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Determine which access token to use
    const accessToken = mpSettings.is_sandbox 
      ? mpSettings.sandbox_access_token_encrypted 
      : mpSettings.access_token_encrypted;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Token de acesso do Mercado Pago não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Extract asset and client data safely
    const asset = subscription.assets as unknown as { 
      id: string; 
      name: string; 
      clients: { id: string; name: string; email: string; phone: string | null } 
    };
    const assetName = asset?.name || "Assinatura";
    const client = asset?.clients;

    // Build payer info
    const payerEmail = customerEmail || client?.email || "cliente@email.com";
    const payerName = customerName || client?.name || "Cliente";
    const payerDocument = customerDocument?.replace(/\D/g, "") || "";
    
    // Get first and last name
    const nameParts = payerName.split(" ");
    const firstName = nameParts[0] || "Cliente";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Base payment data
    const basePaymentData: Record<string, unknown> = {
      transaction_amount: Number(subscription.monthly_value),
      description: `${subscription.plan_name} - ${assetName}`,
      payer: {
        email: payerEmail,
        first_name: firstName,
        last_name: lastName || firstName,
        identification: payerDocument ? {
          type: payerDocument.length === 11 ? "CPF" : "CNPJ",
          number: payerDocument
        } : undefined
      },
      metadata: {
        subscription_id: subscriptionId,
        asset_id: subscription.asset_id,
        return_url: returnUrl || "",
        payment_method: paymentMethod
      },
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      external_reference: `sub_${subscriptionId}_${Date.now()}`
    };

    // Configure based on payment method
    let paymentData = { ...basePaymentData };
    let dbPaymentMethod: "pix" | "card" | "boleto" = "pix";

    switch (paymentMethod) {
      case "pix":
        paymentData.payment_method_id = "pix";
        dbPaymentMethod = "pix";
        break;

      case "card":
        if (!cardToken) {
          return new Response(
            JSON.stringify({ error: "Token do cartão é obrigatório" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        paymentData.token = cardToken;
        paymentData.installments = installments;
        if (issuerId) {
          paymentData.issuer_id = issuerId;
        }
        dbPaymentMethod = "card";
        break;

      case "boleto":
        paymentData.payment_method_id = "bolbradesco"; // Boleto Bradesco
        // Add address for boleto (required)
        (paymentData.payer as Record<string, unknown>).address = {
          zip_code: "01310100",
          street_name: "Avenida Paulista",
          street_number: "1000",
          neighborhood: "Bela Vista",
          city: "São Paulo",
          federal_unit: "SP"
        };
        dbPaymentMethod = "boleto";
        break;

      default:
        paymentData.payment_method_id = "pix";
        dbPaymentMethod = "pix";
    }

    console.log("Creating Mercado Pago payment:", JSON.stringify(paymentData, null, 2));

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${subscriptionId}-${paymentMethod}-${Date.now()}`
      },
      body: JSON.stringify(paymentData)
    });

    const mpResult = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Mercado Pago error:", JSON.stringify(mpResult, null, 2));
      
      // Parse MP error for better messaging
      let errorMessage = "Falha ao criar pagamento";
      if (mpResult.cause && mpResult.cause.length > 0) {
        const cause = mpResult.cause[0];
        errorMessage = cause.description || cause.message || errorMessage;
      } else if (mpResult.message) {
        errorMessage = mpResult.message;
      }

      return new Response(
        JSON.stringify({ 
          error: errorMessage, 
          details: mpResult,
          code: mpResult.status || mpResponse.status
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Mercado Pago payment created:", mpResult.id, "Status:", mpResult.status);

    // Create payment record in database
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        subscription_id: subscriptionId,
        amount: subscription.monthly_value,
        status: mpResult.status === "approved" ? "completed" : "pending",
        payment_method: dbPaymentMethod,
        stripe_payment_intent_id: `mp_${mpResult.id}`,
        paid_at: mpResult.status === "approved" ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
    } else {
      console.log("Payment record created:", payment?.id);
    }

    // If payment was immediately approved (rare for PIX, common for cards)
    if (mpResult.status === "approved") {
      console.log("Payment immediately approved! Updating subscription...");
      
      await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", subscriptionId);

      await supabase
        .from("assets")
        .update({ status: "active", block_reason: null })
        .eq("id", subscription.asset_id);

      // Log the successful payment
      await supabase.from("access_logs").insert({
        asset_id: subscription.asset_id,
        action: "payment_completed",
        details: {
          payment_id: mpResult.id,
          amount: subscription.monthly_value,
          payment_method: dbPaymentMethod,
          gateway: "mercadopago",
          status: "approved"
        }
      });
    }

    // Build response based on payment method
    let response: Record<string, unknown> = {
      paymentId: mpResult.id,
      dbPaymentId: payment?.id,
      status: mpResult.status,
      statusDetail: mpResult.status_detail,
      paymentMethod: dbPaymentMethod
    };

    // Add PIX specific data
    if (paymentMethod === "pix") {
      const pixData = mpResult.point_of_interaction?.transaction_data;
      response = {
        ...response,
        qrCode: pixData?.qr_code,
        qrCodeBase64: pixData?.qr_code_base64,
        ticketUrl: pixData?.ticket_url,
        expirationDate: mpResult.date_of_expiration
      };
    }

    // Add Boleto specific data
    if (paymentMethod === "boleto") {
      const transactionDetails = mpResult.transaction_details;
      response = {
        ...response,
        boletoUrl: transactionDetails?.external_resource_url,
        barcode: mpResult.barcode?.content,
        expirationDate: mpResult.date_of_expiration
      };
    }

    // Add Card specific data
    if (paymentMethod === "card") {
      response = {
        ...response,
        cardLastFour: mpResult.card?.last_four_digits,
        cardBrand: mpResult.payment_method_id,
        installments: mpResult.installments
      };
    }

    console.log("=== PAYMENT CREATED SUCCESSFULLY ===");
    console.log("Response:", JSON.stringify(response, null, 2));

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error creating Mercado Pago payment:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
