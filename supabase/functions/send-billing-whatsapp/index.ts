import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  attemptId: string;
  phone: string;
  clientName: string;
  planName: string;
  amount: number;
  dueDate: string;
  checkoutUrl: string;
  daysRemaining: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { attemptId, phone, clientName, planName, amount, dueDate, checkoutUrl, daysRemaining }: WhatsAppRequest = await req.json();

    console.log(`Sending WhatsApp to ${phone} for attempt ${attemptId}`);

    // Get billing settings (message template + legacy Evolution config)
    const { data: settings } = await supabase
      .from("billing_settings")
      .select("evolution_api_url, evolution_instance, whatsapp_message_template")
      .maybeSingle();

    // Preferred source: instance connected through the Evolution integration screen
    const { data: evo } = await supabase
      .from("evolution_settings")
      .select("server_url, global_api_key, instance_name, instance_token, connection_state")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const baseUrl = (evo?.server_url || settings?.evolution_api_url || "").replace(/\/+$/, "");
    const instanceName = evo?.instance_name || settings?.evolution_instance;
    const evolutionApiKey =
      evo?.instance_token || evo?.global_api_key || Deno.env.get("EVOLUTION_API_KEY");

    if (!baseUrl || !instanceName) {
      throw new Error("Evolution API not configured");
    }
    if (!evolutionApiKey) {
      throw new Error("Evolution API key not configured");
    }
    if (evo?.instance_name && evo.connection_state !== "open") {
      throw new Error("WhatsApp instance is not connected");
    }

    // Process message template
    let messageTemplate = settings?.whatsapp_message_template || `Olá {{client_name}}! 👋

Seu pagamento de R$ {{amount}} do plano {{plan_name}} está pendente desde {{due_date}}.

Regularize agora e evite a suspensão do serviço:
{{checkout_link}}

Qualquer dúvida, estamos à disposição!`;

    // Replace template variables
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);

    const formattedDueDate = new Date(dueDate).toLocaleDateString('pt-BR');

    const message = messageTemplate
      .replace(/\{\{client_name\}\}/g, clientName)
      .replace(/\{\{plan_name\}\}/g, planName)
      .replace(/\{\{amount\}\}/g, formattedAmount)
      .replace(/\{\{due_date\}\}/g, formattedDueDate)
      .replace(/\{\{checkout_link\}\}/g, checkoutUrl)
      .replace(/\{\{days_remaining\}\}/g, String(daysRemaining));

    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, "");
    
    // Ensure phone has country code
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // Send via Evolution API
    const evolutionUrl = `${baseUrl}/message/sendText/${instanceName}`;
    
    const evolutionResponse = await fetch(evolutionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionApiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error("Evolution API error:", errorText);
      throw new Error(`Evolution API error: ${evolutionResponse.status}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log("WhatsApp sent successfully:", evolutionData);

    // Update billing attempt status
    if (attemptId) {
      await supabase
        .from("billing_attempts")
        .update({ 
          status: "success",
          metadata: {
            evolution_response: evolutionData,
            sent_at: new Date().toISOString(),
          }
        })
        .eq("id", attemptId);
    }

    return new Response(
      JSON.stringify({ success: true, data: evolutionData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending WhatsApp:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
