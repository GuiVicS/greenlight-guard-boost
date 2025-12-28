import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Zap, 
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StripeIntegration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [formData, setFormData] = useState({
    publishable_key: '',
    secret_key: '',
    webhook_secret: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const { data, error } = await supabase
        .from('stripe_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setIsConfigured(data.is_configured || false);
        setFormData({
          publishable_key: data.publishable_key || '',
          secret_key: '', // Don't show encrypted key
          webhook_secret: '', // Don't show encrypted key
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from('stripe_settings')
        .select('id')
        .maybeSingle();

      const settingsData: any = {
        publishable_key: formData.publishable_key,
        is_configured: true,
        updated_at: new Date().toISOString(),
      };

      // Only update encrypted fields if they were provided
      if (formData.secret_key) {
        settingsData.secret_key_encrypted = formData.secret_key; // In production, this should be encrypted
      }
      if (formData.webhook_secret) {
        settingsData.webhook_secret_encrypted = formData.webhook_secret; // In production, this should be encrypted
      }

      if (existing) {
        const { error } = await supabase
          .from('stripe_settings')
          .update(settingsData)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('stripe_settings')
          .insert({
            ...settingsData,
            created_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      setIsConfigured(true);
      toast({ 
        title: 'Configurações salvas!',
        description: 'A integração com Stripe foi configurada com sucesso.'
      });

      // Clear sensitive fields
      setFormData(prev => ({
        ...prev,
        secret_key: '',
        webhook_secret: '',
      }));
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
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
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Integração Stripe</h1>
          <p className="text-muted-foreground mt-1">
            Configure suas credenciais do Stripe para processar pagamentos
          </p>
        </div>

        {/* Status Card */}
        <div className={cn(
          "glass-card p-6 flex items-center gap-4",
          isConfigured ? "border-primary/30" : "border-warning/30"
        )}>
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            isConfigured ? "bg-primary/20" : "bg-warning/20"
          )}>
            {isConfigured ? (
              <CheckCircle className="w-6 h-6 text-primary" />
            ) : (
              <AlertCircle className="w-6 h-6 text-warning" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-foreground">
              {isConfigured ? 'Stripe Configurado' : 'Configuração Pendente'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isConfigured 
                ? 'Sua integração com Stripe está ativa' 
                : 'Insira suas credenciais para ativar os pagamentos'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-10 h-10 rounded-lg bg-[#635BFF]/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#635BFF]" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Credenciais da API</h3>
              <p className="text-sm text-muted-foreground">
                Encontre suas chaves no{' '}
                <a 
                  href="https://dashboard.stripe.com/apikeys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Dashboard do Stripe
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="publishable_key">Publishable Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="publishable_key"
                  value={formData.publishable_key}
                  onChange={(e) => setFormData({ ...formData, publishable_key: e.target.value })}
                  placeholder="pk_live_..."
                  className="pl-10"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Chave pública usada no frontend para inicializar o Stripe
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret_key">Secret Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="secret_key"
                  type={showSecretKey ? 'text' : 'password'}
                  value={formData.secret_key}
                  onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                  placeholder={isConfigured ? '••••••••••••••••' : 'sk_live_...'}
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Chave secreta usada no backend para processar pagamentos
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook_secret">Webhook Secret</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="webhook_secret"
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={formData.webhook_secret}
                  onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                  placeholder={isConfigured ? '••••••••••••••••' : 'whsec_...'}
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Secret do webhook para validar eventos do Stripe
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Button 
              type="submit" 
              variant="glow" 
              className="w-full"
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isConfigured ? 'Atualizar Configurações' : 'Salvar Configurações'}
            </Button>
          </div>
        </form>

        {/* Webhook Info */}
        {isConfigured && (
          <div className="glass-card p-6 space-y-4">
            <h3 className="font-medium text-foreground">Configuração do Webhook</h3>
            <p className="text-sm text-muted-foreground">
              Configure o webhook no Dashboard do Stripe para receber notificações de pagamentos.
            </p>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">URL do Webhook:</p>
              <code className="text-sm text-primary break-all">
                {window.location.origin.replace('id-preview--', '').replace('.lovable.app', '.supabase.co')}/functions/v1/stripe-webhook
              </code>
            </div>
            <p className="text-xs text-muted-foreground">
              Eventos recomendados: <code>checkout.session.completed</code>, <code>invoice.paid</code>, <code>invoice.payment_failed</code>
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}