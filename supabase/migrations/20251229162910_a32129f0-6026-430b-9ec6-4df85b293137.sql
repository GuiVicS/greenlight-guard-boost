-- Add stripe_customer_id to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Add billing columns to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS stripe_price_id text,
ADD COLUMN IF NOT EXISTS next_billing_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS auto_charge_enabled boolean NOT NULL DEFAULT false;

-- Add check constraint for billing_type
ALTER TABLE public.subscriptions 
ADD CONSTRAINT subscriptions_billing_type_check 
CHECK (billing_type IN ('manual', 'automatic'));

-- Create stripe_products table for caching Stripe product/price info
CREATE TABLE IF NOT EXISTS public.stripe_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_product_id text NOT NULL UNIQUE,
  stripe_price_id text,
  name text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'brl',
  interval text NOT NULL DEFAULT 'month',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS for stripe_products
ALTER TABLE public.stripe_products ENABLE ROW LEVEL SECURITY;

-- RLS policies for stripe_products
CREATE POLICY "Admin can manage stripe products" 
ON public.stripe_products 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin and staff can view stripe products" 
ON public.stripe_products 
FOR SELECT 
USING (is_admin_or_staff(auth.uid()));

-- Add updated_at trigger for stripe_products
CREATE TRIGGER update_stripe_products_updated_at
BEFORE UPDATE ON public.stripe_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_type ON public.subscriptions(billing_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_auto_charge ON public.subscriptions(auto_charge_enabled);
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer ON public.clients(stripe_customer_id);