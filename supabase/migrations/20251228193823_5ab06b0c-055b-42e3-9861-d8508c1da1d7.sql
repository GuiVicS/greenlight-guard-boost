-- Allow public read access to subscriptions via checkout (by asset_id for overdue status)
CREATE POLICY "Public can view overdue subscriptions for checkout"
ON public.subscriptions
FOR SELECT
USING (status = 'overdue');

-- Allow public read access to assets for checkout
CREATE POLICY "Public can view assets for checkout"
ON public.assets
FOR SELECT
USING (true);

-- Allow public read access to clients for checkout
CREATE POLICY "Public can view clients for checkout"
ON public.clients
FOR SELECT
USING (true);

-- Allow public read of stripe_settings for checkout (only publishable key matters)
CREATE POLICY "Public can view stripe settings for checkout"
ON public.stripe_settings
FOR SELECT
USING (is_configured = true);