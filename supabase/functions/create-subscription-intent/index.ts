import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_VERSION = "2023-10-16";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function stripeFetch(path: string, secretKey: string, params?: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_VERSION,
    },
    body: params,
  });
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { subscriptionId, customer } = await req.json();
    if (!subscriptionId) return json({ error: "Missing subscriptionId" });

    const { data: stripeSettings } = await supabase
      .from("stripe_settings")
      .select("*")
      .eq("is_configured", true)
      .single();

    if (!stripeSettings?.secret_key_encrypted) {
      return json({ error: "Stripe não está configurado" });
    }
    const secretKey = stripeSettings.secret_key_encrypted as string;

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select(`*, asset:assets ( id, name, stripe_price_id, client:clients ( id, name, email ) )`)
      .eq("id", subscriptionId)
      .single();

    if (subError || !subscription) return json({ error: "Assinatura não encontrada" });

    const priceId = subscription.asset?.stripe_price_id || subscription.stripe_price_id;
    if (!priceId) return json({ error: "Assinatura sem price recorrente na Stripe" });

    const email = customer?.email || subscription.asset?.client?.email || "";
    const name = customer?.name || subscription.asset?.client?.name || "";

    // Reuse or create Stripe customer
    let stripeCustomerId: string | null = subscription.stripe_customer_id || null;
    if (!stripeCustomerId) {
      const created = await stripeFetch(
        "customers",
        secretKey,
        new URLSearchParams({
          email,
          name,
          "metadata[subscription_id]": subscriptionId,
          "metadata[asset_id]": subscription.asset?.id || "",
        }),
      );
      if (created.error) return json({ error: created.error.message });
      stripeCustomerId = created.id;
      await supabase
        .from("subscriptions")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", subscriptionId);
    }

    // Create incomplete subscription so the first invoice can be paid inline
    const params = new URLSearchParams({
      customer: stripeCustomerId!,
      "items[0][price]": priceId,
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "payment_settings[payment_method_types][0]": "card",
      "expand[]": "latest_invoice.payment_intent",
      "metadata[subscription_id]": subscriptionId,
      "metadata[asset_id]": subscription.asset?.id || "",
    });

    const stripeSub = await stripeFetch("subscriptions", secretKey, params);
    if (stripeSub.error) {
      console.error("Stripe subscription error:", stripeSub.error);
      return json({ error: stripeSub.error.message });
    }

    const invoice = stripeSub.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    // Invoice already settled (customer had a saved default card): treat as paid
    if (!paymentIntent?.client_secret && (invoice?.status === "paid" || invoice?.paid)) {
      await supabase.from("payments").insert({
        subscription_id: subscriptionId,
        amount: subscription.monthly_value,
        status: "completed",
        payment_method: "card",
        paid_at: new Date().toISOString(),
      });
      await supabase
        .from("subscriptions")
        .update({ stripe_subscription_id: stripeSub.id, status: "active" })
        .eq("id", subscriptionId);

      return json({ alreadyPaid: true, stripeSubscriptionId: stripeSub.id });
    }

    if (!paymentIntent?.client_secret) {
      console.error("No payment intent on invoice:", JSON.stringify({
        subscription_status: stripeSub.status,
        invoice_status: invoice?.status,
        invoice_total: invoice?.total,
        currency: invoice?.currency,
        last_finalization_error: invoice?.last_finalization_error,
      }));
      const finErr = invoice?.last_finalization_error?.message;
      return json({
        error: finErr
          ? `Stripe: ${finErr}`
          : "Não foi possível iniciar o pagamento da assinatura",
      });
    }



    // Register a pending payment locally
    const { data: payment } = await supabase
      .from("payments")
      .insert({
        subscription_id: subscriptionId,
        amount: subscription.monthly_value,
        status: "pending",
        payment_method: "card",
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select()
      .single();

    await supabase
      .from("subscriptions")
      .update({ stripe_subscription_id: stripeSub.id })
      .eq("id", subscriptionId);

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeSubscriptionId: stripeSub.id,
      publishableKey: stripeSettings.publishable_key,
      paymentId: payment?.id ?? null,
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});
