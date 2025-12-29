-- Add more checkout customization fields to assets table
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS checkout_title text,
ADD COLUMN IF NOT EXISTS checkout_favicon_url text,
ADD COLUMN IF NOT EXISTS checkout_description text;

-- Add comments for documentation
COMMENT ON COLUMN public.assets.checkout_title IS 'Custom page title for the checkout page';
COMMENT ON COLUMN public.assets.checkout_favicon_url IS 'Custom favicon URL for the checkout page';
COMMENT ON COLUMN public.assets.checkout_description IS 'Custom meta description for the checkout page';