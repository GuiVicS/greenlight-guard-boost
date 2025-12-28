-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- Create enum for asset types
CREATE TYPE public.asset_type AS ENUM ('wordpress', 'shopify', 'custom', 'other');

-- Create enum for asset status
CREATE TYPE public.asset_status AS ENUM ('active', 'blocked');

-- Create enum for subscription status
CREATE TYPE public.subscription_status AS ENUM ('active', 'overdue', 'cancelled');

-- Create enum for payment method
CREATE TYPE public.payment_method AS ENUM ('pix', 'card');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Assets table (sites/systems)
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type asset_type NOT NULL DEFAULT 'custom',
  public_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status asset_status NOT NULL DEFAULT 'active',
  block_reason TEXT,
  checkout_logo_url TEXT,
  checkout_primary_color TEXT DEFAULT '#10B981',
  checkout_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
  plan_name TEXT NOT NULL,
  monthly_value DECIMAL(10,2) NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  due_date DATE NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Access logs table
CREATE TABLE public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Stripe settings table (for admin to configure)
CREATE TABLE public.stripe_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key_encrypted TEXT,
  publishable_key TEXT,
  webhook_secret_encrypted TEXT,
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_settings ENABLE ROW LEVEL SECURITY;

-- Function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin or staff
CREATE OR REPLACE FUNCTION public.is_admin_or_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff')
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" 
ON public.user_roles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" 
ON public.user_roles FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert their profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for clients (admin/staff only)
CREATE POLICY "Admin and staff can view clients" 
ON public.clients FOR SELECT 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can insert clients" 
ON public.clients FOR INSERT 
WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can update clients" 
ON public.clients FOR UPDATE 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin can delete clients" 
ON public.clients FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for assets
CREATE POLICY "Admin and staff can view assets" 
ON public.assets FOR SELECT 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can insert assets" 
ON public.assets FOR INSERT 
WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can update assets" 
ON public.assets FOR UPDATE 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin can delete assets" 
ON public.assets FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for subscriptions
CREATE POLICY "Admin and staff can view subscriptions" 
ON public.subscriptions FOR SELECT 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can manage subscriptions" 
ON public.subscriptions FOR ALL 
USING (public.is_admin_or_staff(auth.uid()));

-- RLS Policies for payments
CREATE POLICY "Admin and staff can view payments" 
ON public.payments FOR SELECT 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin and staff can manage payments" 
ON public.payments FOR ALL 
USING (public.is_admin_or_staff(auth.uid()));

-- RLS Policies for access_logs
CREATE POLICY "Admin and staff can view logs" 
ON public.access_logs FOR SELECT 
USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "System can insert logs" 
ON public.access_logs FOR INSERT 
WITH CHECK (true);

-- RLS Policies for stripe_settings (admin only)
CREATE POLICY "Only admin can view stripe settings" 
ON public.stripe_settings FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can manage stripe settings" 
ON public.stripe_settings FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stripe_settings_updated_at
  BEFORE UPDATE ON public.stripe_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
