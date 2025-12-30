-- Adicionar campo public_key na tabela mercadopago_settings
ALTER TABLE public.mercadopago_settings 
ADD COLUMN IF NOT EXISTS public_key text,
ADD COLUMN IF NOT EXISTS sandbox_public_key text;