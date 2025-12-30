import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Map Mercado Pago status to our status
const STATUS_MAP: Record<string, "pending" | "completed" | "failed"> = {
  approved: "completed",
  authorized: "completed",
  in_process: "pending",
  in_mediation: "pending",
  pending: "pending",
  rejected: "failed",
  cancelled: "failed",
  refunded: "failed",
  charged_back: "failed",
};

Deno.serve(async (req) => {
  // Allow both GET and POST for MP webhook verification
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET request - MP sometimes sends a GET to verify the endpoint
  if (req.method === "GET") {
    console.log("Webhook verification request received");
    return new Response(
      JSON.stringify({ status: "ok", message: "Webhook endpoint active" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the raw body for logging
    const body = await req.json();
    
    console.log("=== MERCADOPAGO WEBHOOK RECEIVED ===");
    console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));
    console.log("Body:", JSON.stringify(body, null, 2));

    // Mercado Pago sends notifications in different formats:
    // 1. IPN v1: { topic: "payment", id: "123" }
    // 2. IPN v2/Webhooks: { action: "payment.updated", data: { id: "123" } }
    // 3. Direct: { type: "payment", data: { id: "123" } }

    let topic = body.topic || body.type || body.action?.split(".")[0];
    let action = body.action || body.topic;
    let resourceId = body.data?.id || body.id;

    // Handle different notification formats
    if (body.action && body.data?.id) {
      // Webhook format: { action: "payment.created", data: { id: "123" } }
      topic = "payment";
      resourceId = body.data.id;
    }

    console.log("Parsed - Topic:", topic, "Action:", action, "Resource ID:", resourceId);

    // If no valid topic or resource, acknowledge but don't process
    if (!topic || !resourceId) {
      console.log("No valid topic or resource ID found, acknowledging...");
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: "no_resource" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only process payment notifications
    const validTopics = ["payment", "payment.created", "payment.updated"];
    if (!validTopics.includes(topic) && !action?.includes("payment")) {
      console.log(`Ignoring non-payment topic: ${topic}, action: ${action}`);
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: "not_payment" }),
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
      console.error("Mercado Pago not configured:", mpError);
      return new Response(
        JSON.stringify({ error: "Mercado Pago not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const accessToken = mpSettings.is_sandbox 
      ? mpSettings.sandbox_access_token_encrypted 
      : mpSettings.access_token_encrypted;

    if (!accessToken) {
      console.error("No access token configured");
      return new Response(
        JSON.stringify({ error: "No access token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch payment details from Mercado Pago API
    console.log(`Fetching payment ${resourceId} from Mercado Pago API...`);
    
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      console.error("Failed to fetch payment from MP:", paymentResponse.status, errorText);
      
      // Don't fail the webhook, MP might retry
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: "mp_api_error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mpPayment = await paymentResponse.json();
    console.log("=== MERCADOPAGO PAYMENT DETAILS ===");
    console.log("Payment ID:", mpPayment.id);
    console.log("Status:", mpPayment.status);
    console.log("Status Detail:", mpPayment.status_detail);
    console.log("Payment Method:", mpPayment.payment_method_id);
    console.log("Amount:", mpPayment.transaction_amount);
    console.log("Metadata:", JSON.stringify(mpPayment.metadata, null, 2));
    console.log("External Reference:", mpPayment.external_reference);

    // Extract subscription and asset IDs from metadata or external_reference
    let subscriptionId = mpPayment.metadata?.subscription_id;
    let assetId = mpPayment.metadata?.asset_id;
    const returnUrl = mpPayment.metadata?.return_url;
    const savedPaymentMethod = mpPayment.metadata?.payment_method || "pix";

    // If no metadata, try to parse from external_reference (format: sub_UUID_timestamp)
    if (!subscriptionId && mpPayment.external_reference) {
      const parts = mpPayment.external_reference.split("_");
      if (parts[0] === "sub" && parts.length >= 2) {
        subscriptionId = parts[1];
        console.log("Extracted subscription_id from external_reference:", subscriptionId);
      }
    }

    if (!subscriptionId) {
      console.log("No subscription_id found in payment metadata or external_reference");
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: "no_subscription" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the payment record in our database by MP payment ID
    const { data: dbPayment, error: findError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("stripe_payment_intent_id", `mp_${resourceId}`)
      .maybeSingle();

    if (findError) {
      console.error("Error finding payment:", findError);
    }

    console.log("DB Payment found:", dbPayment?.id, "Current status:", dbPayment?.status);

    // Map MP status to our status
    const newStatus = STATUS_MAP[mpPayment.status] || "pending";
    console.log(`Status mapping: ${mpPayment.status} -> ${newStatus}`);

    // Only process if status actually changed or payment is approved
    if (dbPayment?.status === "completed" && newStatus === "completed") {
      console.log("Payment already completed, skipping...");
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: "already_completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get subscription to find asset_id if not in metadata
    if (!assetId) {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("asset_id")
        .eq("id", subscriptionId)
        .single();
      
      assetId = subscription?.asset_id;
    }

    // Process based on status
    if (newStatus === "completed") {
      console.log("=== PAYMENT APPROVED - Processing... ===");

      // Update payment status
      if (dbPayment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update({
            status: "completed",
            paid_at: new Date().toISOString()
          })
          .eq("id", dbPayment.id);
        
        if (updateError) {
          console.error("Error updating payment:", updateError);
        } else {
          console.log("Payment record updated to completed");
        }
      } else {
        // Create payment record if it doesn't exist
        console.log("Payment record not found, creating...");
        const { data: newPayment, error: createError } = await supabase
          .from("payments")
          .insert({
            subscription_id: subscriptionId,
            amount: mpPayment.transaction_amount,
            status: "completed",
            payment_method: savedPaymentMethod,
            stripe_payment_intent_id: `mp_${resourceId}`,
            paid_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating payment:", createError);
        } else {
          console.log("Payment record created:", newPayment?.id);
        }
      }

      // Update subscription status to active
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ 
          status: "active",
          failed_charge_count: 0,
          notification_days_count: 0,
          notification_started_at: null,
          last_charge_attempt: null
        })
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

        // Log the successful payment
        await supabase.from("access_logs").insert({
          asset_id: assetId,
          action: "payment_completed_webhook",
          details: {
            payment_id: resourceId,
            mp_status: mpPayment.status,
            amount: mpPayment.transaction_amount,
            payment_method: mpPayment.payment_method_id,
            gateway: "mercadopago",
            return_url: returnUrl || null,
            webhook_action: action
          }
        });
      }

      console.log("=== PAYMENT PROCESSING COMPLETE ===");

    } else if (newStatus === "failed") {
      console.log(`Payment failed/rejected: ${mpPayment.status} - ${mpPayment.status_detail}`);

      if (dbPayment) {
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", dbPayment.id);
        console.log("Payment record updated to failed");
      }

      // Log failed payment
      if (assetId) {
        await supabase.from("access_logs").insert({
          asset_id: assetId,
          action: "payment_failed_webhook",
          details: {
            payment_id: resourceId,
            mp_status: mpPayment.status,
            status_detail: mpPayment.status_detail,
            payment_method: mpPayment.payment_method_id,
            gateway: "mercadopago"
          }
        });
      }

    } else {
      console.log(`Payment still pending: ${mpPayment.status}`);
    }

    return new Response(
      JSON.stringify({ 
        received: true, 
        processed: true,
        payment_id: resourceId,
        status: mpPayment.status,
        our_status: newStatus
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("=== WEBHOOK ERROR ===", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Always return 200 to prevent MP from retrying indefinitely
    return new Response(
      JSON.stringify({ received: true, processed: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
