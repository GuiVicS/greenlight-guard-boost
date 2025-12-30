import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  Globe,
  Copy,
  Check,
  ExternalLink,
  CreditCard,
  FileText,
  Loader2,
  Lock,
  Unlock,
  Palette,
  Image as ImageIcon,
  Package,
  Link as LinkIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tables } from '@/integrations/supabase/types';

type Asset = Tables<'assets'> & {
  clients?: { name: string; email: string } | null;
};

type Subscription = Tables<'subscriptions'>;
type AccessLog = Tables<'access_logs'>;

export default function AssetDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [asset, setAsset] = useState<Asset | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  const [checkoutSettings, setCheckoutSettings] = useState({
    checkout_message: '',
    checkout_primary_color: '#10B981',
    checkout_logo_url: '',
    checkout_theme: 'light' as 'light' | 'dark',
    checkout_title: '',
    checkout_favicon_url: '',
    checkout_description: '',
  });

  useEffect(() => {
    if (id) {
      fetchAssetData();
    }
  }, [id]);

  async function fetchAssetData() {
    try {
      const [assetRes, subscriptionRes, logsRes] = await Promise.all([
        supabase
          .from('assets')
          .select('*, clients(name, email)')
          .eq('id', id)
          .single(),
        supabase
          .from('subscriptions')
          .select('*')
          .eq('asset_id', id)
          .maybeSingle(),
        supabase
          .from('access_logs')
          .select('*')
          .eq('asset_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (assetRes.error) throw assetRes.error;
      
      setAsset(assetRes.data);
      setSubscription(subscriptionRes.data);
      setLogs(logsRes.data || []);
      
      setCheckoutSettings({
        checkout_message: assetRes.data.checkout_message || '',
        checkout_primary_color: assetRes.data.checkout_primary_color || '#10B981',
        checkout_logo_url: assetRes.data.checkout_logo_url || '',
        checkout_theme: (assetRes.data as any).checkout_theme || 'light',
        checkout_title: (assetRes.data as any).checkout_title || '',
        checkout_favicon_url: (assetRes.data as any).checkout_favicon_url || '',
        checkout_description: (assetRes.data as any).checkout_description || '',
      });
    } catch (error) {
      console.error('Error fetching asset:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do ativo',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast({ title: 'Copiado!' });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleToggleBlock = async () => {
    if (!asset) return;
    
    try {
      const newStatus = asset.status === 'blocked' ? 'active' : 'blocked';
      const { error } = await supabase
        .from('assets')
        .update({ 
          status: newStatus,
          block_reason: newStatus === 'blocked' ? 'Bloqueado manualmente' : null 
        })
        .eq('id', asset.id);

      if (error) throw error;
      
      setAsset({ ...asset, status: newStatus });
      toast({ 
        title: newStatus === 'blocked' ? 'Ativo bloqueado!' : 'Ativo desbloqueado!' 
      });
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const handleSaveCheckoutSettings = async () => {
    if (!asset) return;
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('assets')
        .update(checkoutSettings)
        .eq('id', asset.id);

      if (error) throw error;
      
      setAsset({ ...asset, ...checkoutSettings });
      toast({ title: 'Configurações salvas!' });
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getBlockingScript = () => {
    if (!asset) return '';
    const baseUrl = `https://hthupflasjifsweetqhx.supabase.co/functions/v1/blocking-script`;
    return `<script src="${baseUrl}?key=${asset.public_key}" defer></script>`;
  };

  const getCheckoutUrl = () => {
    if (!asset) return '';
    return `${window.location.origin}/checkout/${asset.id}`;
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

  if (!asset) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-foreground">Ativo não encontrado</h2>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/assets')}>
            Voltar para Ativos
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/assets')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{asset.name}</h1>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-medium",
                asset.status === 'active' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
              )}>
                {asset.status === 'active' ? 'Ativo' : 'Bloqueado'}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">
              {asset.clients?.name} • {asset.type}
            </p>
          </div>
          <Button
            variant={asset.status === 'blocked' ? 'default' : 'destructive'}
            onClick={handleToggleBlock}
          >
            {asset.status === 'blocked' ? (
              <>
                <Unlock className="w-4 h-4" />
                Desbloquear
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Bloquear
              </>
            )}
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="integration">Integração</TabsTrigger>
            <TabsTrigger value="checkout">Checkout</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Asset Info */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  {asset.type === 'infoproduct' ? (
                    <Package className="w-5 h-5 text-primary" />
                  ) : (
                    <Globe className="w-5 h-5 text-primary" />
                  )}
                  Informações do Ativo
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="text-foreground">{asset.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span className="text-foreground capitalize">
                      {asset.type === 'infoproduct' ? 'Infoproduto' : asset.type}
                    </span>
                  </div>
                  {asset.type === 'infoproduct' && (asset as any).infoproduct_url && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Link do Produto</span>
                      <a 
                        href={(asset as any).infoproduct_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 max-w-[200px] truncate"
                      >
                        <LinkIcon className="w-3 h-3" />
                        {(asset as any).infoproduct_url}
                      </a>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="text-foreground">{asset.clients?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="text-foreground">{asset.clients?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Criado em</span>
                    <span className="text-foreground">
                      {new Date(asset.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Subscription Info */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Assinatura
                </h3>
                {subscription ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plano</span>
                      <span className="text-foreground">{subscription.plan_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Mensal</span>
                      <span className="text-foreground">
                        R$ {Number(subscription.monthly_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vencimento</span>
                      <span className="text-foreground">
                        {new Date(subscription.due_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        subscription.status === 'active' ? 'bg-primary/20 text-primary' :
                        subscription.status === 'overdue' ? 'bg-warning/20 text-warning' :
                        'bg-destructive/20 text-destructive'
                      )}>
                        {subscription.status === 'active' ? 'Ativa' :
                         subscription.status === 'overdue' ? 'Atrasada' : 'Cancelada'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nenhuma assinatura vinculada a este ativo.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Integration Tab */}
          <TabsContent value="integration" className="space-y-6">
            <div className="glass-card p-6 space-y-6">
              {/* Infoproduct Link Section - Only for infoproducts */}
              {asset.type === 'infoproduct' && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    Link do Infoproduto
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Este é o link para onde o cliente será redirecionado automaticamente após o pagamento ser confirmado.
                  </p>
                  <div className="flex gap-2">
                    <Input 
                      value={(asset as any).infoproduct_url || ''} 
                      readOnly 
                      className="flex-1"
                      placeholder="Nenhum link configurado"
                    />
                    {(asset as any).infoproduct_url && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => copyToClipboard((asset as any).infoproduct_url, 'infoproduct')}
                        >
                          {copied === 'infoproduct' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => window.open((asset as any).infoproduct_url, '_blank')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Blocking Script - Only for non-infoproducts */}
              {asset.type !== 'infoproduct' && (
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Script de Bloqueio</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Adicione este script ao seu site para ativar o sistema de bloqueio automático.
                  </p>
                  <div className="relative">
                    <pre className="bg-muted/30 rounded-lg p-4 text-sm overflow-x-auto">
                      <code className="text-primary">{getBlockingScript()}</code>
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(getBlockingScript(), 'script')}
                    >
                      {copied === 'script' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-foreground mb-2">Chave Pública</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Use esta chave para identificar o ativo nas requisições.
                </p>
                <div className="relative">
                  <Input
                    value={asset.public_key}
                    readOnly
                    className="pr-12"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 -translate-y-1/2 right-1"
                    onClick={() => copyToClipboard(asset.public_key, 'key')}
                  >
                    {copied === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Link do Checkout</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {asset.type === 'infoproduct' 
                    ? 'Compartilhe este link com clientes para realizar a compra do infoproduto.'
                    : 'Compartilhe este link com clientes para regularizar pagamentos.'}
                </p>
                <div className="flex gap-2">
                  <Input value={getCheckoutUrl()} readOnly className="flex-1" />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(getCheckoutUrl(), 'checkout')}
                  >
                    {copied === 'checkout' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(getCheckoutUrl(), '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Checkout Tab */}
          <TabsContent value="checkout" className="space-y-6">
            <div className="glass-card p-6 space-y-6">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                Personalização do Checkout
              </h3>

              <div className="space-y-4">
                {/* SEO & Branding Section */}
                <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">SEO & Branding</h4>
                  
                  <div className="space-y-2">
                    <Label>Título da Página</Label>
                    <Input
                      value={checkoutSettings.checkout_title}
                      onChange={(e) => setCheckoutSettings({ 
                        ...checkoutSettings, 
                        checkout_title: e.target.value 
                      })}
                      placeholder="Ex: Pagamento - Nome da Empresa"
                    />
                    <p className="text-xs text-muted-foreground">Título exibido na aba do navegador</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Meta Descrição</Label>
                    <Textarea
                      value={checkoutSettings.checkout_description}
                      onChange={(e) => setCheckoutSettings({ 
                        ...checkoutSettings, 
                        checkout_description: e.target.value 
                      })}
                      placeholder="Ex: Regularize seu pagamento de forma rápida e segura."
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">Descrição para mecanismos de busca</p>
                  </div>

                  <div className="space-y-2">
                    <Label>URL do Favicon</Label>
                    <Input
                      value={checkoutSettings.checkout_favicon_url}
                      onChange={(e) => setCheckoutSettings({ 
                        ...checkoutSettings, 
                        checkout_favicon_url: e.target.value 
                      })}
                      placeholder="https://exemplo.com/favicon.ico"
                    />
                    <p className="text-xs text-muted-foreground">Ícone exibido na aba do navegador (16x16 ou 32x32 px)</p>
                  </div>
                </div>

                {/* Visual Appearance Section */}
                <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Aparência Visual</h4>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      URL do Logo
                    </Label>
                    <Input
                      value={checkoutSettings.checkout_logo_url}
                      onChange={(e) => setCheckoutSettings({ 
                        ...checkoutSettings, 
                        checkout_logo_url: e.target.value 
                      })}
                      placeholder="https://exemplo.com/logo.png"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Cor Principal</Label>
                    <div className="flex gap-3">
                      <Input
                        type="color"
                        value={checkoutSettings.checkout_primary_color}
                        onChange={(e) => setCheckoutSettings({ 
                          ...checkoutSettings, 
                          checkout_primary_color: e.target.value 
                        })}
                        className="w-16 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={checkoutSettings.checkout_primary_color}
                        onChange={(e) => setCheckoutSettings({ 
                          ...checkoutSettings, 
                          checkout_primary_color: e.target.value 
                        })}
                        placeholder="#10B981"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tema do Checkout</Label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCheckoutSettings({ 
                          ...checkoutSettings, 
                          checkout_theme: 'light' 
                        })}
                        className={cn(
                          "flex-1 p-4 rounded-lg border-2 transition-all",
                          "flex flex-col items-center gap-2",
                          checkoutSettings.checkout_theme === 'light' 
                            ? "border-primary bg-primary/10" 
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="w-12 h-8 bg-white border border-border rounded shadow-sm"></div>
                        <span className="text-sm font-medium">Light</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutSettings({ 
                          ...checkoutSettings, 
                          checkout_theme: 'dark' 
                        })}
                        className={cn(
                          "flex-1 p-4 rounded-lg border-2 transition-all",
                          "flex flex-col items-center gap-2",
                          checkoutSettings.checkout_theme === 'dark' 
                            ? "border-primary bg-primary/10" 
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="w-12 h-8 bg-slate-900 border border-slate-700 rounded shadow-sm"></div>
                        <span className="text-sm font-medium">Dark</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Conteúdo</h4>
                  
                  <div className="space-y-2">
                    <Label>Mensagem Personalizada</Label>
                    <Textarea
                      value={checkoutSettings.checkout_message}
                      onChange={(e) => setCheckoutSettings({ 
                        ...checkoutSettings, 
                        checkout_message: e.target.value 
                      })}
                      placeholder="Ex: Regularize seu pagamento e mantenha seu site ativo!"
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Mensagem exibida no checkout para o cliente</p>
                  </div>
                </div>

                <Button 
                  variant="glow" 
                  onClick={handleSaveCheckoutSettings}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Configurações
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-6">
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Últimos Acessos
                </h3>
              </div>
              
              {logs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Nenhum log encontrado para este ativo.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Data</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Ação</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">IP</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="p-4 text-sm text-foreground">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "px-2 py-1 rounded text-xs font-medium",
                              log.action === 'block' ? 'bg-destructive/20 text-destructive' :
                              log.action === 'access' ? 'bg-primary/20 text-primary' :
                              'bg-muted text-muted-foreground'
                            )}>
                              {log.action === 'block' ? 'Bloqueio' :
                               log.action === 'access' ? 'Acesso' : log.action}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground">
                            {log.ip_address || '-'}
                          </td>
                          <td className="p-4 text-sm text-muted-foreground max-w-xs truncate">
                            {log.details ? JSON.stringify(log.details) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
