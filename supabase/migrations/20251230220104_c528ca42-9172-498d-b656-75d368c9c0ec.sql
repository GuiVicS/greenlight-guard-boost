-- Add infoproduct to asset_type enum
ALTER TYPE public.asset_type ADD VALUE IF NOT EXISTS 'infoproduct';

-- Add infoproduct_url column to assets table
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS infoproduct_url TEXT;