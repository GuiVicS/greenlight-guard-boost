-- Tabela de endpoints de webhook
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_enabled boolean NOT NULL DEFAULT true,
  events text[] NOT NULL DEFAULT '{}',
  headers jsonb DEFAULT '{}',
  retry_count integer NOT NULL DEFAULT 5,
  timeout_ms integer NOT NULL DEFAULT 30000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de entregas de webhook
CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_id text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz,
  last_attempt_at timestamptz,
  response_status integer,
  response_body text,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_retry ON public.webhook_deliveries(next_retry_at) 
  WHERE status = 'pending';
CREATE INDEX idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_endpoints_enabled ON public.webhook_endpoints(is_enabled) 
  WHERE is_enabled = true;

-- Habilitar RLS
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Políticas para webhook_endpoints
CREATE POLICY "Admin can manage webhook endpoints" 
  ON public.webhook_endpoints 
  FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view webhook endpoints" 
  ON public.webhook_endpoints 
  FOR SELECT 
  USING (is_admin_or_staff(auth.uid()));

-- Políticas para webhook_deliveries
CREATE POLICY "Admin and staff can view deliveries" 
  ON public.webhook_deliveries 
  FOR SELECT 
  USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "System can insert deliveries" 
  ON public.webhook_deliveries 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "System can update deliveries" 
  ON public.webhook_deliveries 
  FOR UPDATE 
  USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();