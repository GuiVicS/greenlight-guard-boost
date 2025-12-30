import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  attemptId: string;
  to: string;
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { attemptId, to, clientName, planName, amount, dueDate, checkoutUrl, daysRemaining }: EmailRequest = await req.json();

    console.log(`Sending billing email to ${to} for attempt ${attemptId}`);

    // Get billing settings for templates
    const { data: settings } = await supabase
      .from("billing_settings")
      .select("sender_email, sender_name, email_subject_template, email_message_template")
      .maybeSingle();

    const senderEmail = settings?.sender_email || "cobranca@seudominio.com";
    const senderName = settings?.sender_name || "Equipe de Cobrança";
    
    // Process templates with variables
    let subject = settings?.email_subject_template || "Pagamento pendente - {{plan_name}}";
    let htmlContent = settings?.email_message_template || `
      <h2>Olá {{client_name}},</h2>
      <p>Identificamos que o pagamento da sua assinatura está pendente.</p>
      <p><strong>Plano:</strong> {{plan_name}}<br>
      <strong>Valor:</strong> R$ {{amount}}<br>
      <strong>Vencimento:</strong> {{due_date}}</p>
      <p><a href="{{checkout_link}}">Clique aqui para regularizar</a></p>
      <p>Após {{days_remaining}} dia(s) seu serviço será suspenso.</p>
    `;

    // Replace template variables
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);

    const formattedDueDate = new Date(dueDate).toLocaleDateString('pt-BR');

    const replaceVariables = (template: string) => {
      return template
        .replace(/\{\{client_name\}\}/g, clientName)
        .replace(/\{\{plan_name\}\}/g, planName)
        .replace(/\{\{amount\}\}/g, formattedAmount)
        .replace(/\{\{due_date\}\}/g, formattedDueDate)
        .replace(/\{\{checkout_link\}\}/g, checkoutUrl)
        .replace(/\{\{days_remaining\}\}/g, String(daysRemaining));
    };

    subject = replaceVariables(subject);
    htmlContent = replaceVariables(htmlContent);

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [to],
      subject: subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    // Update billing attempt status
    if (attemptId) {
      const emailData = emailResponse.data;
      await supabase
        .from("billing_attempts")
        .update({ 
          status: "success",
          metadata: {
            resend_id: emailData?.id || null,
            sent_at: new Date().toISOString(),
          }
        })
        .eq("id", attemptId);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending billing email:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
