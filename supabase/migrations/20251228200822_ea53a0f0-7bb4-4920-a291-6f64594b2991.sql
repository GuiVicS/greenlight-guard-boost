-- Add checkout theme column to assets table
ALTER TABLE public.assets 
ADD COLUMN checkout_theme text DEFAULT 'light' CHECK (checkout_theme IN ('light', 'dark'));