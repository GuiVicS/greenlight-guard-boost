import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Zap, 
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  CreditCard,
  FileText,
  QrCode
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StripeSettings {
  id?: string;
  publishable_key: string;
  secret_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  is_configured: boolean;
  is_enabled: boolean;
  is_sandbox: boolean;
}

interface MercadoPagoSettings {
  id?: string;
  access_token_encrypted: string | null;
  sandbox_access_token_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  public_key: string | null;
  sandbox_public_key: string | null;
  is_configured: boolean;
  is_enabled: boolean;
  is_sandbox: boolean;
}

interface PaymentMethodConfig {
  id: string;
  method_name: string;
  gateway_type: string;
  is_enabled: boolean;
  country: string;
}

export default function PaymentGatewaysSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showStripeWebhook, setShowStripeWebhook] = useState(false);
  const [showMPToken, setShowMPToken] = useState(false);
  const [showMPSandboxToken, setShowMPSandboxToken] = useState(false);

  const [stripeSettings, setStripeSettings] = useState<StripeSettings>({
    publishable_key: '',
    secret_key_encrypted: null,
    webhook_secret_encrypted: null,
    is_configured: false,
    is_enabled: true,
    is_sandbox: false,
  });

  const [mpSettings, setMPSettings] = useState<MercadoPagoSettings>({
    access_token_encrypted: null,
    sandbox_access_token_encrypted: null,
    webhook_secret_encrypted: null,
    public_key: null,
    sandbox_public_key: null,
    is_configured: false,
    is_enabled: false,
    is_sandbox: true,
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [mpAccessToken, setMPAccessToken] = useState('');
  const [mpSandboxToken, setMPSandboxToken] = useState('');
  const [mpPublicKey, setMPPublicKey] = useState('');
  const [mpSandboxPublicKey, setMPSandboxPublicKey] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      // Fetch Stripe settings
      const { data: stripeData } = await supabase
        .from('stripe_settings')
        .select('*')
        .maybeSingle();

      if (stripeData) {
        setStripeSettings({
          id: stripeData.id,
          publishable_key: stripeData.publishable_key || '',
          secret_key_encrypted: stripeData.secret_key_encrypted,
          webhook_secret_encrypted: stripeData.webhook_secret_encrypted,
          is_configured: stripeData.is_configured || false,
          is_enabled: stripeData.is_enabled ?? true,
          is_sandbox: stripeData.is_sandbox ?? false,
        });
      }

      // Fetch Mercado Pago settings
      const { data: mpData } = await supabase
        .from('mercadopago_settings')
        .select('*')
        .maybeSingle();

      if (mpData) {
        const hasSandbox = Boolean(mpData.sandbox_access_token_encrypted) && Boolean(mpData.sandbox_public_key);
        const hasProduction = Boolean(mpData.access_token_encrypted) && Boolean(mpData.public_key);
        const fullyConfigured = (mpData.is_sandbox ?? true) ? hasSandbox : hasProduction;

        setMPSettings({
          id: mpData.id,
          access_token_encrypted: mpData.access_token_encrypted,
          sandbox_access_token_encrypted: mpData.sandbox_access_token_encrypted,
          webhook_secret_encrypted: mpData.webhook_secret_encrypted,
          public_key: mpData.public_key || null,
          sandbox_public_key: mpData.sandbox_public_key || null,
          is_configured: fullyConfigured,
          is_enabled: mpData.is_enabled ?? false,
          is_sandbox: mpData.is_sandbox ?? true,
        });
      }

      // Fetch payment methods config
      const { data: methodsData } = await supabase
        .from('payment_methods_config')
        .select('*')
        .order('method_name');

      if (methodsData) {
        setPaymentMethods(methodsData);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSaveStripe = async () => {
    setSaving(true);
    try {
      const settingsData: Record<string, unknown> = {
        publishable_key: stripeSettings.publishable_key,
        is_enabled: stripeSettings.is_enabled,
        is_sandbox: stripeSettings.is_sandbox,
        is_configured: true,
        updated_at: new Date().toISOString(),
      };

      if (stripeSecretKey) {
        settingsData.secret_key_encrypted = stripeSecretKey;
      }
      if (stripeWebhookSecret) {
        settingsData.webhook_secret_encrypted = stripeWebhookSecret;
      }

      if (stripeSettings.id) {
        const { error } = await supabase
          .from('stripe_settings')
          .update(settingsData)
          .eq('id', stripeSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('stripe_settings')
          .insert({ ...settingsData, created_at: new Date().toISOString() });
        if (error) throw error;
      }

      toast({ title: 'Stripe salvo com sucesso!' });
      setStripeSecretKey('');
      setStripeWebhookSecret('');
      fetchSettings();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMercadoPago = async () => {
    setSaving(true);
    try {
      const settingsData: Record<string, unknown> = {
        is_enabled: mpSettings.is_enabled,
        is_sandbox: mpSettings.is_sandbox,
        // is_configured será calculado após aplicar as chaves
        updated_at: new Date().toISOString(),
      };

      if (mpAccessToken) {
        settingsData.access_token_encrypted = mpAccessToken;
      }
      if (mpSandboxToken) {
        settingsData.sandbox_access_token_encrypted = mpSandboxToken;
      }
      if (mpPublicKey) {
        settingsData.public_key = mpPublicKey;
      }
      if (mpSandboxPublicKey) {
        settingsData.sandbox_public_key = mpSandboxPublicKey;
      }

      // Decide se está "configurado" o suficiente para Cartão (exige Access Token + Public Key no modo selecionado)
      const effectiveProdToken = mpAccessToken || mpSettings.access_token_encrypted;
      const effectiveSandboxToken = mpSandboxToken || mpSettings.sandbox_access_token_encrypted;
      const effectiveProdPublicKey = mpPublicKey || mpSettings.public_key;
      const effectiveSandboxPublicKey = mpSandboxPublicKey || mpSettings.sandbox_public_key;

      const fullyConfigured = mpSettings.is_sandbox
        ? Boolean(effectiveSandboxToken) && Boolean(effectiveSandboxPublicKey)
        : Boolean(effectiveProdToken) && Boolean(effectiveProdPublicKey);

      settingsData.is_configured = fullyConfigured;

      if (mpSettings.id) {
        const { error } = await supabase
          .from('mercadopago_settings')
          .update(settingsData)
          .eq('id', mpSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('mercadopago_settings')
          .insert({ ...settingsData, created_at: new Date().toISOString() });
        if (error) throw error;
      }

      // Update pix payment method based on MP settings
      const pixMethod = paymentMethods.find(m => m.method_name === 'pix' && m.gateway_type === 'mercadopago');
      if (pixMethod) {
        await supabase
          .from('payment_methods_config')
          .update({ is_enabled: mpSettings.is_enabled })
          .eq('id', pixMethod.id);
      }

      toast({ title: 'Mercado Pago salvo com sucesso!' });
      setMPAccessToken('');
      setMPSandboxToken('');
      setMPPublicKey('');
      setMPSandboxPublicKey('');
      fetchSettings();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const togglePaymentMethod = async (method: PaymentMethodConfig) => {
    try {
      const { error } = await supabase
        .from('payment_methods_config')
        .update({ is_enabled: !method.is_enabled })
        .eq('id', method.id);

      if (error) throw error;

      setPaymentMethods(prev =>
        prev.map(m => m.id === method.id ? { ...m, is_enabled: !m.is_enabled } : m)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Meios de Pagamento</h1>
          <p className="text-muted-foreground mt-1">
            Configure os gateways de pagamento e métodos aceitos
          </p>
        </div>

        <Tabs defaultValue="stripe" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="stripe" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Stripe
            </TabsTrigger>
            <TabsTrigger value="mercadopago" className="flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Mercado Pago
            </TabsTrigger>
          </TabsList>

          {/* STRIPE TAB */}
          <TabsContent value="stripe" className="space-y-6">
            {/* Status Card */}
            <div className={cn(
              "glass-card p-6 flex items-center gap-4",
              stripeSettings.is_configured ? "border-primary/30" : "border-warning/30"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                stripeSettings.is_configured ? "bg-primary/20" : "bg-warning/20"
              )}>
                {stripeSettings.is_configured ? (
                  <CheckCircle className="w-6 h-6 text-primary" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-warning" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">
                  {stripeSettings.is_configured ? 'Stripe Configurado' : 'Configuração Pendente'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {stripeSettings.is_configured 
                    ? 'Cartão de Crédito e Boleto' 
                    : 'Insira suas credenciais para ativar'}
                </p>
              </div>
              <Switch
                checked={stripeSettings.is_enabled}
                onCheckedChange={(checked) => setStripeSettings(prev => ({ ...prev, is_enabled: checked }))}
              />
            </div>

            {/* Stripe Form */}
            <div className="glass-card p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-lg bg-[#635BFF]/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#635BFF]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Credenciais da API</h3>
                  <a 
                    href="https://dashboard.stripe.com/apikeys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Dashboard do Stripe <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="stripe-sandbox" className="text-sm">Sandbox</Label>
                  <Switch
                    id="stripe-sandbox"
                    checked={stripeSettings.is_sandbox}
                    onCheckedChange={(checked) => setStripeSettings(prev => ({ ...prev, is_sandbox: checked }))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Publishable Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={stripeSettings.publishable_key}
                      onChange={(e) => setStripeSettings(prev => ({ ...prev, publishable_key: e.target.value }))}
                      placeholder="pk_live_..."
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showStripeSecret ? 'text' : 'password'}
                      value={stripeSecretKey}
                      onChange={(e) => setStripeSecretKey(e.target.value)}
                      placeholder={stripeSettings.secret_key_encrypted ? '••••••••••••' : 'sk_live_...'}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStripeSecret(!showStripeSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showStripeSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showStripeWebhook ? 'text' : 'password'}
                      value={stripeWebhookSecret}
                      onChange={(e) => setStripeWebhookSecret(e.target.value)}
                      placeholder={stripeSettings.webhook_secret_encrypted ? '••••••••••••' : 'whsec_...'}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStripeWebhook(!showStripeWebhook)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showStripeWebhook ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveStripe} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar Stripe
              </Button>
            </div>

            {/* Stripe Payment Methods */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="font-medium text-foreground">Métodos de Pagamento</h3>
              {paymentMethods.filter(m => m.gateway_type === 'stripe').map(method => (
                <div key={method.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    {method.method_name === 'card' ? (
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className="font-medium capitalize">
                      {method.method_name === 'card' ? 'Cartão de Crédito' : 'Boleto Bancário'}
                    </span>
                  </div>
                  <Switch
                    checked={method.is_enabled}
                    onCheckedChange={() => togglePaymentMethod(method)}
                  />
                </div>
              ))}
            </div>

            {/* Webhook URL */}
            {stripeSettings.is_configured && (
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-medium text-foreground">URL do Webhook</h3>
                <div className="bg-muted/30 rounded-lg p-4">
                  <code className="text-sm text-primary break-all">
                    https://hthupflasjifsweetqhx.supabase.co/functions/v1/stripe-webhook
                  </code>
                </div>
              </div>
            )}
          </TabsContent>

          {/* MERCADO PAGO TAB */}
          <TabsContent value="mercadopago" className="space-y-6">
            {/* Status Card */}
            <div className={cn(
              "glass-card p-6 flex items-center gap-4",
              mpSettings.is_configured ? "border-primary/30" : "border-warning/30"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                mpSettings.is_configured ? "bg-primary/20" : "bg-warning/20"
              )}>
                {mpSettings.is_configured ? (
                  <CheckCircle className="w-6 h-6 text-primary" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-warning" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">
                  {mpSettings.is_configured ? 'Mercado Pago Configurado' : 'Configuração Pendente'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {mpSettings.is_configured 
                    ? 'Pix (exclusivo)' 
                    : 'Insira suas credenciais para ativar'}
                </p>
              </div>
              <Switch
                checked={mpSettings.is_enabled}
                onCheckedChange={(checked) => setMPSettings(prev => ({ ...prev, is_enabled: checked }))}
              />
            </div>

            {/* Mercado Pago Form */}
            <div className="glass-card p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-lg bg-[#009EE3]/20 flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-[#009EE3]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Credenciais da API</h3>
                  <a 
                    href="https://www.mercadopago.com.br/developers/panel/app" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Painel de Desenvolvedores <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="mp-sandbox" className="text-sm">Sandbox</Label>
                  <Switch
                    id="mp-sandbox"
                    checked={mpSettings.is_sandbox}
                    onCheckedChange={(checked) => setMPSettings(prev => ({ ...prev, is_sandbox: checked }))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Access Token (Produção)</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showMPToken ? 'text' : 'password'}
                      value={mpAccessToken}
                      onChange={(e) => setMPAccessToken(e.target.value)}
                      placeholder={mpSettings.access_token_encrypted ? '••••••••••••' : 'APP_USR-...'}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMPToken(!showMPToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showMPToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Access Token (Sandbox)</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showMPSandboxToken ? 'text' : 'password'}
                      value={mpSandboxToken}
                      onChange={(e) => setMPSandboxToken(e.target.value)}
                      placeholder={mpSettings.sandbox_access_token_encrypted ? '••••••••••••' : 'TEST-...'}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMPSandboxToken(!showMPSandboxToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showMPSandboxToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Public Key (Produção)</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={mpPublicKey}
                      onChange={(e) => setMPPublicKey(e.target.value)}
                      placeholder={mpSettings.public_key ? '••••••••••••' : 'APP_USR-...'}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Encontre sua Public Key no painel de credenciais do Mercado Pago
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Public Key (Sandbox)</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={mpSandboxPublicKey}
                      onChange={(e) => setMPSandboxPublicKey(e.target.value)}
                      placeholder={mpSettings.sandbox_public_key ? '••••••••••••' : 'TEST-...'}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveMercadoPago} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar Mercado Pago
              </Button>
            </div>

            {(() => {
              const mpMethods = paymentMethods
                .filter((m) => m.gateway_type === 'mercadopago')
                // dedupe por method_name (evita repetir Pix caso haja duplicata no banco/cache)
                .reduce<PaymentMethodConfig[]>((acc, cur) => {
                  if (acc.some((m) => m.method_name === cur.method_name)) return acc;
                  acc.push(cur);
                  return acc;
                }, []);

              return (
                <div className="glass-card p-6 space-y-4">
                  <h3 className="font-medium text-foreground">Métodos de Pagamento</h3>
                  {mpMethods.map((method) => (
                    <div key={method.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        {method.method_name === 'pix' ? (
                          <QrCode className="w-5 h-5 text-muted-foreground" />
                        ) : method.method_name === 'card' ? (
                          <CreditCard className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        )}
                        <span className="font-medium">
                          {method.method_name === 'pix'
                            ? 'Pix'
                            : method.method_name === 'card'
                              ? 'Cartão (Crédito/Débito)'
                              : 'Boleto Bancário'}
                        </span>
                      </div>
                      <Switch checked={method.is_enabled} onCheckedChange={() => togglePaymentMethod(method)} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Webhook URL */}
            {mpSettings.is_configured && (
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-medium text-foreground">URL do Webhook</h3>
                <div className="bg-muted/30 rounded-lg p-4">
                  <code className="text-sm text-primary break-all">
                    https://hthupflasjifsweetqhx.supabase.co/functions/v1/mercadopago-webhook
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configure no painel do Mercado Pago para receber notificações de pagamentos aprovados.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
