import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoChargeRequest {
  subscriptionId: string;
  attemptNumber: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { subscriptionId, attemptNumber }: AutoChargeRequest = await req.json();

    console.log(`Processing auto-charge for subscription ${subscriptionId}, attempt ${attemptNumber}`);

    // Get subscription details
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        *,
        assets!inner (
          id,
          name,
          clients!inner (
            id,
            name,
            email,
            stripe_customer_id
          )
        )
      `)
      .eq("id", subscriptionId)
      .single();

    if (subError || !subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    const client = subscription.assets?.clients;

    // When a Stripe Subscription exists, billing/retries are handled by Stripe natively.
    // The local scheduler should not duplicate charges; webhooks update the local state.
    if (subscription.stripe_subscription_id) {
      console.log(`Subscription ${subscriptionId} has Stripe subscription ${subscription.stripe_subscription_id}; skipping local auto-charge.`);
      await supabase.from("billing_attempts").insert({
        subscription_id: subscriptionId,
        attempt_type: "auto_charge",
        attempt_number: attemptNumber,
        status: "success",
        sent_to: client?.email,
        error_message: null,
        metadata: { info: "Managed by Stripe subscription", stripe_subscription_id: subscription.stripe_subscription_id },
      });
      return new Response(
        JSON.stringify({
          success: true,
          managedByStripe: true,
          subscriptionId,
          message: "Billing is managed by Stripe subscription.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let chargeSuccess = false;
    let chargeError: string | null = null;
    let paymentData: any = null;

    // Determine which gateway to use based on country and configuration
    const { data: paymentMethods } = await supabase
      .from("payment_methods_config")
      .select("*")
      .eq("method_name", "card")
      .eq("is_enabled", true)
      .maybeSingle();

    const useStripe = paymentMethods?.gateway_type === "stripe";

    if (useStripe && subscription.stripe_customer_id) {
      // Stripe off-session payment
      const { data: stripeSettings } = await supabase
        .from("stripe_settings")
        .select("*")
        .eq("is_configured", true)
        .maybeSingle();

      if (stripeSettings?.secret_key_encrypted) {
        try {
          // Get the customer's default payment method
          const customerResponse = await fetch(
            `https://api.stripe.com/v1/customers/${subscription.stripe_customer_id}`,
            {
              headers: {
                Authorization: `Bearer ${stripeSettings.secret_key_encrypted}`,
              },
            }
          );

          const customer = await customerResponse.json();
          
          if (customer.invoice_settings?.default_payment_method || customer.default_source) {
            const paymentMethodId = customer.invoice_settings?.default_payment_method || customer.default_source;

            // Create off-session payment intent
            const paymentIntentResponse = await fetch(
              "https://api.stripe.com/v1/payment_intents",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Bearer ${stripeSettings.secret_key_encrypted}`,
                },
                body: new URLSearchParams({
                  amount: String(Math.round(subscription.monthly_value * 100)),
                  currency: subscription.country === "BR" ? "brl" : "usd",
                  customer: subscription.stripe_customer_id,
                  payment_method: paymentMethodId,
                  off_session: "true",
                  confirm: "true",
                  "metadata[subscription_id]": subscriptionId,
                  "metadata[auto_charge]": "true",
                }),
              }
            );

            const paymentIntent = await paymentIntentResponse.json();

            if (paymentIntent.status === "succeeded") {
              chargeSuccess = true;
              paymentData = {
                provider: "stripe",
                payment_intent_id: paymentIntent.id,
                amount: subscription.monthly_value,
              };
            } else if (paymentIntent.error) {
              chargeError = paymentIntent.error.message;
            } else {
              chargeError = `Payment status: ${paymentIntent.status}`;
            }
          } else {
            chargeError = "No payment method on file";
          }
        } catch (stripeError: any) {
          chargeError = stripeError.message;
        }
      }
    } else {
      // Mercado Pago recurring payment
      const { data: mpSettings } = await supabase
        .from("mercadopago_settings")
        .select("*")
        .eq("is_configured", true)
        .maybeSingle();

      if (mpSettings) {
        const accessToken = mpSettings.is_sandbox
          ? mpSettings.sandbox_access_token_encrypted
          : mpSettings.access_token_encrypted;

        // For Mercado Pago, we need to check if customer has saved cards
        // This would require storing customer_id from previous payments
        // For now, log that MP auto-charge is not fully implemented
        console.log("Mercado Pago auto-charge: checking for saved payment methods...");
        chargeError = "Mercado Pago auto-charge requires saved payment methods";
      } else {
        chargeError = "No payment gateway configured";
      }
    }

    // Log the billing attempt
    const { data: billingAttempt } = await supabase
      .from("billing_attempts")
      .insert({
        subscription_id: subscriptionId,
        attempt_type: "auto_charge",
        attempt_number: attemptNumber,
        status: chargeSuccess ? "success" : "failed",
        sent_to: client?.email,
        error_message: chargeError,
        metadata: paymentData || { error: chargeError },
      })
      .select()
      .single();

    if (chargeSuccess && paymentData) {
      // Create payment record
      await supabase.from("payments").insert({
        subscription_id: subscriptionId,
        amount: subscription.monthly_value,
        payment_method: "card",
        status: "completed",
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentData.payment_intent_id,
      });

      // Update subscription
      const nextDueDate = new Date(subscription.due_date);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);

      await supabase
        .from("subscriptions")
        .update({
          status: "active",
          due_date: nextDueDate.toISOString().split('T')[0],
          failed_charge_count: 0,
          notification_days_count: 0,
          notification_started_at: null,
          last_charge_attempt: new Date().toISOString(),
        })
        .eq("id", subscriptionId);

      // Ensure asset is active
      await supabase
        .from("assets")
        .update({ status: "active", block_reason: null })
        .eq("id", subscription.asset_id);

      console.log(`Auto-charge successful for subscription ${subscriptionId}`);
    } else {
      // Update failed charge count
      await supabase
        .from("subscriptions")
        .update({
          failed_charge_count: attemptNumber,
          last_charge_attempt: new Date().toISOString(),
        })
        .eq("id", subscriptionId);

      console.log(`Auto-charge failed for subscription ${subscriptionId}: ${chargeError}`);
    }

    return new Response(
      JSON.stringify({
        success: chargeSuccess,
        subscriptionId,
        attemptNumber,
        error: chargeError,
        paymentData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing auto-charge:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
