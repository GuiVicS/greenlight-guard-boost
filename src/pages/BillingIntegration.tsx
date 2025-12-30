import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, 
  Mail,
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ArrowLeft,
  Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface BillingSettings {
  id?: string;
  is_enabled: boolean;
  evolution_api_url: string;
  evolution_instance: string;
  sender_email: string;
  sender_name: string;
  email_subject_template: string;
  email_message_template: string;
  whatsapp_message_template: string;
  max_auto_charge_attempts: number;
  notification_days_before_block: number;
}

const defaultEmailTemplate = `Olá {nome}!

Identificamos que o pagamento da sua assinatura está pendente.

Plano: {plano}
Valor: R$ {valor}
Vencimento: {vencimento}

Regularize agora clicando no link abaixo:
{link_checkout}

Após {dias_restantes} dia(s) sem pagamento, seu serviço será suspenso.

Atenciosamente,
Equipe SiteGuard`;

const defaultWhatsAppTemplate = `Olá {nome}! 👋

Seu pagamento de R$ {valor} do plano *{plano}* está pendente desde {vencimento}.

🔗 Regularize agora e evite a suspensão do serviço:
{link_checkout}

⏰ Você tem {dias_restantes} dia(s) para regularizar.

Qualquer dúvida, estamos à disposição!`;

export default function BillingIntegration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [evolutionApiKey, setEvolutionApiKey] = useState('');

  const [settings, setSettings] = useState<BillingSettings>({
    is_enabled: false,
    evolution_api_url: '',
    evolution_instance: '',
    sender_email: '',
    sender_name: '',
    email_subject_template: 'Pagamento pendente - {plano}',
    email_message_template: defaultEmailTemplate,
    whatsapp_message_template: defaultWhatsAppTemplate,
    max_auto_charge_attempts: 4,
    notification_days_before_block: 2,
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const { data } = await supabase
        .from('billing_settings')
        .select('*')
        .maybeSingle();

      if (data) {
        setSettings({
          id: data.id,
          is_enabled: data.is_enabled || false,
          evolution_api_url: data.evolution_api_url || '',
          evolution_instance: data.evolution_instance || '',
          sender_email: data.sender_email || '',
          sender_name: data.sender_name || '',
          email_subject_template: data.email_subject_template || 'Pagamento pendente - {plano}',
          email_message_template: data.email_message_template || defaultEmailTemplate,
          whatsapp_message_template: data.whatsapp_message_template || defaultWhatsAppTemplate,
          max_auto_charge_attempts: data.max_auto_charge_attempts || 4,
          notification_days_before_block: data.notification_days_before_block || 2,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsData: Record<string, unknown> = {
        is_enabled: settings.is_enabled,
        evolution_api_url: settings.evolution_api_url,
        evolution_instance: settings.evolution_instance,
        sender_email: settings.sender_email,
        sender_name: settings.sender_name,
        email_subject_template: settings.email_subject_template,
        email_message_template: settings.email_message_template,
        whatsapp_message_template: settings.whatsapp_message_template,
        max_auto_charge_attempts: settings.max_auto_charge_attempts,
        notification_days_before_block: settings.notification_days_before_block,
        updated_at: new Date().toISOString(),
      };

      if (settings.id) {
        const { error } = await supabase
          .from('billing_settings')
          .update(settingsData)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('billing_settings')
          .insert({ ...settingsData, created_at: new Date().toISOString() });
        if (error) throw error;
      }

      toast({ title: 'Configurações salvas com sucesso!' });
      fetchSettings();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const whatsappConfigured = !!(settings.evolution_api_url && settings.evolution_instance);
  const emailConfigured = !!(settings.sender_email && settings.sender_name);

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
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/integrations')}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Cobrança Automática</h1>
            <p className="text-muted-foreground mt-1">
              Configure notificações por WhatsApp e Email
            </p>
          </div>
        </div>

        {/* Status Geral */}
        <div className={cn(
          "glass-card p-6 flex items-center gap-4",
          settings.is_enabled ? "border-primary/30" : "border-muted"
        )}>
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            settings.is_enabled ? "bg-primary/20" : "bg-muted"
          )}>
            {settings.is_enabled ? (
              <CheckCircle className="w-6 h-6 text-primary" />
            ) : (
              <AlertCircle className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground">
              {settings.is_enabled ? 'Sistema de Cobrança Ativo' : 'Sistema de Cobrança Desativado'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {settings.is_enabled 
                ? `${settings.max_auto_charge_attempts} tentativas automáticas + ${settings.notification_days_before_block} dias de notificação` 
                : 'Ative para enviar cobranças automáticas'}
            </p>
          </div>
          <Switch
            checked={settings.is_enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, is_enabled: checked }))}
          />
        </div>

        {/* Configurações Gerais */}
        <div className="glass-card p-6 space-y-4">
          <h3 className="font-medium text-foreground">Configurações de Escalonamento</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tentativas de débito automático</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.max_auto_charge_attempts}
                onChange={(e) => setSettings(prev => ({ ...prev, max_auto_charge_attempts: parseInt(e.target.value) || 4 }))}
              />
              <p className="text-xs text-muted-foreground">Número de tentativas antes de iniciar notificações</p>
            </div>
            <div className="space-y-2">
              <Label>Dias de notificação antes do bloqueio</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={settings.notification_days_before_block}
                onChange={(e) => setSettings(prev => ({ ...prev, notification_days_before_block: parseInt(e.target.value) || 2 }))}
              />
              <p className="text-xs text-muted-foreground">Dias enviando cobrança por email/WhatsApp</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="whatsapp" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              WhatsApp
              {whatsappConfigured && <CheckCircle className="w-3 h-3 text-primary" />}
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email
              {emailConfigured && <CheckCircle className="w-3 h-3 text-primary" />}
            </TabsTrigger>
          </TabsList>

          {/* WHATSAPP TAB */}
          <TabsContent value="whatsapp" className="space-y-6">
            <div className="glass-card p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-[#25D366]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Evolution API</h3>
                  <a 
                    href="https://doc.evolution-api.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Documentação <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>URL da API</Label>
                  <Input
                    value={settings.evolution_api_url}
                    onChange={(e) => setSettings(prev => ({ ...prev, evolution_api_url: e.target.value }))}
                    placeholder="https://sua-instancia.evolution-api.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nome da Instância</Label>
                  <Input
                    value={settings.evolution_instance}
                    onChange={(e) => setSettings(prev => ({ ...prev, evolution_instance: e.target.value }))}
                    placeholder="nome-da-instancia"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Template da Mensagem</Label>
                  <Textarea
                    value={settings.whatsapp_message_template}
                    onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_message_template: e.target.value }))}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Variáveis: {'{nome}'}, {'{plano}'}, {'{valor}'}, {'{vencimento}'}, {'{link_checkout}'}, {'{dias_restantes}'}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* EMAIL TAB */}
          <TabsContent value="email" className="space-y-6">
            <div className="glass-card p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-lg bg-[#6366F1]/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#6366F1]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Configuração de Email</h3>
                  <a 
                    href="https://resend.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Resend <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Email do Remetente</Label>
                    <Input
                      type="email"
                      value={settings.sender_email}
                      onChange={(e) => setSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                      placeholder="cobranca@seudominio.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Remetente</Label>
                    <Input
                      value={settings.sender_name}
                      onChange={(e) => setSettings(prev => ({ ...prev, sender_name: e.target.value }))}
                      placeholder="Equipe SiteGuard"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Assunto do Email</Label>
                  <Input
                    value={settings.email_subject_template}
                    onChange={(e) => setSettings(prev => ({ ...prev, email_subject_template: e.target.value }))}
                    placeholder="Pagamento pendente - {plano}"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Corpo do Email</Label>
                  <Textarea
                    value={settings.email_message_template}
                    onChange={(e) => setSettings(prev => ({ ...prev, email_message_template: e.target.value }))}
                    rows={12}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Variáveis: {'{nome}'}, {'{plano}'}, {'{valor}'}, {'{vencimento}'}, {'{link_checkout}'}, {'{dias_restantes}'}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Configurações
        </Button>
      </div>
    </DashboardLayout>
  );
}
