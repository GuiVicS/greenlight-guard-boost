-- Drop existing policy that only allows viewing overdue subscriptions
DROP POLICY IF EXISTS "Public can view overdue subscriptions for checkout" ON public.subscriptions;

-- Create new policy that allows public to view any subscription by asset_id for checkout
CREATE POLICY "Public can view subscriptions for checkout"
ON public.subscriptions
FOR SELECT
USING (true);