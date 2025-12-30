-- Create billing_attempts table to track all billing attempts and notifications
CREATE TABLE public.billing_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('auto_charge', 'email', 'whatsapp')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  sent_to TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_billing_attempts_subscription_id ON public.billing_attempts(subscription_id);
CREATE INDEX idx_billing_attempts_created_at ON public.billing_attempts(created_at DESC);
CREATE INDEX idx_billing_attempts_type_status ON public.billing_attempts(attempt_type, status);

-- Enable RLS
ALTER TABLE public.billing_attempts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin and staff can view billing attempts"
ON public.billing_attempts
FOR SELECT
USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can manage billing attempts"
ON public.billing_attempts
FOR ALL
USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "System can insert billing attempts"
ON public.billing_attempts
FOR INSERT
WITH CHECK (true);

-- Add new columns to subscriptions for billing tracking
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS failed_charge_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_charge_attempt TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS notification_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS notification_days_count INTEGER DEFAULT 0;

-- Create billing_settings table for Evolution API and email configuration
CREATE TABLE public.billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_api_url TEXT,
  evolution_instance TEXT,
  sender_email TEXT DEFAULT 'cobranca@seudominio.com',
  sender_name TEXT DEFAULT 'Equipe de Cobrança',
  email_subject_template TEXT DEFAULT 'Pagamento pendente - {{plan_name}}',
  whatsapp_message_template TEXT DEFAULT 'Olá {{client_name}}! 👋

Seu pagamento de R$ {{amount}} do plano {{plan_name}} está pendente desde {{due_date}}.

Regularize agora e evite a suspensão do serviço:
{{checkout_link}}

Qualquer dúvida, estamos à disposição!',
  email_message_template TEXT DEFAULT '<h2>Olá {{client_name}},</h2>
<p>Identificamos que o pagamento da sua assinatura está pendente.</p>
<p><strong>Plano:</strong> {{plan_name}}<br>
<strong>Valor:</strong> R$ {{amount}}<br>
<strong>Vencimento:</strong> {{due_date}}</p>
<p><a href="{{checkout_link}}">Clique aqui para regularizar</a></p>
<p>Após {{days_remaining}} dia(s) seu serviço será suspenso.</p>',
  max_auto_charge_attempts INTEGER DEFAULT 4,
  notification_days_before_block INTEGER DEFAULT 2,
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for billing_settings
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for billing_settings
CREATE POLICY "Admin can manage billing settings"
ON public.billing_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin and staff can view billing settings"
ON public.billing_settings
FOR SELECT
USING (is_admin_or_staff(auth.uid()));

-- Insert default billing settings
INSERT INTO public.billing_settings (id) VALUES (gen_random_uuid());

-- Create trigger for updated_at
CREATE TRIGGER update_billing_settings_updated_at
BEFORE UPDATE ON public.billing_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();