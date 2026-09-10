import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  subscriptionId: string;
  invoiceId?: string;
  attemptCount?: number;
  blocked?: boolean;
  hostedInvoiceUrl?: string | null;
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function buildMessage(opts: {
  clientName: string;
  planName: string;
  amount: number;
  attemptCount: number;
  blocked: boolean;
  link: string | null;
}) {
  const { clientName, planName, amount, attemptCount, blocked, link } = opts;
  const linkLine = link ? `\n\nPague agora: ${link}` : "";

  if (blocked) {
    return `Olá ${clientName}, tudo bem?\n\nNão conseguimos aprovar o pagamento de R$ ${money(amount)} do plano ${planName} após ${attemptCount} tentativas.\n\n⛔ O acesso foi suspenso temporariamente e será reativado automaticamente assim que o pagamento for confirmado.${linkLine}`;
  }

  if (attemptCount <= 1) {
    return `Olá ${clientName}! 👋\n\nO pagamento de R$ ${money(amount)} do plano ${planName} não foi aprovado pelo seu banco.\n\nVamos tentar novamente automaticamente, mas você pode regularizar agora mesmo.${linkLine}`;
  }

  return `Olá ${clientName}!\n\nEsta é a ${attemptCount}ª tentativa de cobrança do plano ${planName} (R$ ${money(amount)}) e ela também não foi aprovada.\n\n⚠️ Regularize para evitar a suspensão do acesso.${linkLine}`;
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

    const {
      subscriptionId,
      invoiceId,
      attemptCount = 1,
      blocked = false,
      hostedInvoiceUrl = null,
    }: Payload = await req.json();

    if (!subscriptionId) throw new Error("subscriptionId is required");

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("id, plan_name, monthly_value, asset_id, assets(id, public_key, clients(name, phone))")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (subError || !subscription) throw new Error("Subscription not found");

    const client = (subscription as any).assets?.clients;
    const phone: string | null = client?.phone ?? null;
    const clientName: string = client?.name ?? "cliente";

    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: "client_without_phone" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Checkout link fallback
    let link = hostedInvoiceUrl;
    if (!link) {
      const { data: appSettings } = await supabase
        .from("app_settings")
        .select("checkout_base_url")
        .maybeSingle();
      const publicKey = (subscription as any).assets?.public_key;
      if (appSettings?.checkout_base_url && publicKey) {
        link = `${appSettings.checkout_base_url.replace(/\/+$/, "")}/checkout/${publicKey}`;
      }
    }

    // Log the attempt
    const { data: attempt } = await supabase
      .from("billing_attempts")
      .insert({
        subscription_id: subscriptionId,
        attempt_type: "whatsapp_payment_failed",
        attempt_number: attemptCount,
        status: "pending",
        sent_to: phone,
        metadata: { invoice_id: invoiceId ?? null, blocked },
      })
      .select("id")
      .maybeSingle();

    // Evolution config (integration screen first, legacy fallback)
    const { data: evo } = await supabase
      .from("evolution_settings")
      .select("server_url, global_api_key, instance_name, instance_token, connection_state")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: settings } = await supabase
      .from("billing_settings")
      .select("evolution_api_url, evolution_instance")
      .maybeSingle();

    const baseUrl = (evo?.server_url || settings?.evolution_api_url || "").replace(/\/+$/, "");
    const instanceName = evo?.instance_name || settings?.evolution_instance;
    const apiKey = evo?.instance_token || evo?.global_api_key || Deno.env.get("EVOLUTION_API_KEY");

    if (!baseUrl || !instanceName || !apiKey) {
      throw new Error("Evolution API not configured");
    }
    if (evo?.instance_name && evo.connection_state !== "open") {
      throw new Error("WhatsApp instance is not connected");
    }

    const message = buildMessage({
      clientName,
      planName: subscription.plan_name,
      amount: Number(subscription.monthly_value),
      attemptCount,
      blocked,
      link,
    });

    const digits = phone.replace(/\D/g, "");
    const number = digits.startsWith("55") ? digits : `55${digits}`;

    const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text: message }),
    });

    const responseBody = await res.text();

    if (!res.ok) {
      if (attempt?.id) {
        await supabase
          .from("billing_attempts")
          .update({ status: "failed", error_message: responseBody.slice(0, 500) })
          .eq("id", attempt.id);
      }
      throw new Error(`Evolution API error ${res.status}: ${responseBody}`);
    }

    if (attempt?.id) {
      await supabase
        .from("billing_attempts")
        .update({
          status: "success",
          metadata: {
            invoice_id: invoiceId ?? null,
            blocked,
            sent_at: new Date().toISOString(),
          },
        })
        .eq("id", attempt.id);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-payment-failed-whatsapp]", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
