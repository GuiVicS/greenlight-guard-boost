-- Add country column to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN country TEXT NOT NULL DEFAULT 'BR';

-- Create app_settings table for configurable settings
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_base_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admin can manage app settings
CREATE POLICY "Admin can manage app settings" 
ON public.app_settings 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Public can view app settings (needed for blocking-script)
CREATE POLICY "Public can view app settings" 
ON public.app_settings 
FOR SELECT
USING (true);

-- Insert default settings row
INSERT INTO public.app_settings (checkout_base_url) VALUES ('');

-- Add trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();