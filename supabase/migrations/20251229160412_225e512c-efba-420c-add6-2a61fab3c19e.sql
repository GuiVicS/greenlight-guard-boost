-- Criar tabela para configurações do Mercado Pago
CREATE TABLE public.mercadopago_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  access_token_encrypted TEXT,
  sandbox_access_token_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mercadopago_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Only admin can manage mercadopago settings"
ON public.mercadopago_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admin can view mercadopago settings"
ON public.mercadopago_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view mercadopago settings for checkout"
ON public.mercadopago_settings
FOR SELECT
USING (is_configured = true);

-- Trigger para updated_at
CREATE TRIGGER update_mercadopago_settings_updated_at
BEFORE UPDATE ON public.mercadopago_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar tabela para configuração de métodos de pagamento
CREATE TABLE public.payment_methods_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method_name TEXT NOT NULL, -- 'card', 'pix', 'boleto'
  gateway_type TEXT NOT NULL, -- 'stripe', 'mercadopago'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  country TEXT NOT NULL DEFAULT 'BR',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(method_name, gateway_type, country)
);

-- Enable RLS
ALTER TABLE public.payment_methods_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Only admin can manage payment methods config"
ON public.payment_methods_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view enabled payment methods"
ON public.payment_methods_config
FOR SELECT
USING (is_enabled = true);

-- Trigger para updated_at
CREATE TRIGGER update_payment_methods_config_updated_at
BEFORE UPDATE ON public.payment_methods_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir configurações padrão de métodos de pagamento
INSERT INTO public.payment_methods_config (method_name, gateway_type, is_enabled, country) VALUES
('card', 'stripe', true, 'BR'),
('boleto', 'stripe', true, 'BR'),
('pix', 'mercadopago', false, 'BR');

-- Adicionar is_enabled e is_sandbox à stripe_settings
ALTER TABLE public.stripe_settings 
ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false;