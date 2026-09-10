import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Webhook, ExternalLink, Copy, Trash2, Eye, Settings2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { IntegrationWizard } from "@/components/integrations/IntegrationWizard";

interface WebhookEndpointDB {
  id: string;
  name: string;
  url: string;
  secret: string;
  is_enabled: boolean;
  events: string[];
  headers: Json;
  retry_count: number;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
}

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  is_enabled: boolean;
  events: string[];
  headers: Record<string, string>;
  retry_count: number;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
}

interface DeliveryStats {
  endpoint_id: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
}

const AVAILABLE_EVENTS = [
  { id: 'asset.blocked', name: 'Ativo Bloqueado', description: 'Quando um ativo é bloqueado por inadimplência' },
  { id: 'asset.unblocked', name: 'Ativo Desbloqueado', description: 'Quando um ativo é desbloqueado após pagamento' },
  { id: 'payment.completed', name: 'Pagamento Concluído', description: 'Quando um pagamento é confirmado' },
  { id: 'payment.failed', name: 'Pagamento Falhou', description: 'Quando um pagamento falha' },
  { id: 'subscription.created', name: 'Assinatura Criada', description: 'Quando uma nova assinatura é criada' },
  { id: 'subscription.overdue', name: 'Assinatura em Atraso', description: 'Quando uma assinatura fica em atraso' },
  { id: 'subscription.cancelled', name: 'Assinatura Cancelada', description: 'Quando uma assinatura é cancelada' },
  { id: 'client.created', name: 'Cliente Criado', description: 'Quando um novo cliente é cadastrado' },
  { id: 'client.updated', name: 'Cliente Atualizado', description: 'Quando os dados de um cliente são alterados' },
  { id: 'checkout.started', name: 'Checkout Iniciado', description: 'Quando um cliente acessa o checkout' },
  { id: 'checkout.completed', name: 'Checkout Concluído', description: 'Quando o checkout é finalizado' },
];

const WebhooksSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [stats, setStats] = useState<DeliveryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<WebhookEndpoint | null>(null);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formRetryCount, setFormRetryCount] = useState(5);
  const [formTimeoutMs, setFormTimeoutMs] = useState(30000);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    try {
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const mapped = (data || []).map((d: WebhookEndpointDB) => ({
        ...d,
        headers: (d.headers || {}) as Record<string, string>
      }));
      setEndpoints(mapped);

      // Buscar estatísticas de entregas
      if (data && data.length > 0) {
        const statsPromises = data.map(async (endpoint) => {
          const { data: deliveries } = await supabase
            .from('webhook_deliveries')
            .select('status')
            .eq('endpoint_id', endpoint.id);

          const total = deliveries?.length || 0;
          const success = deliveries?.filter(d => d.status === 'success').length || 0;
          const failed = deliveries?.filter(d => d.status === 'failed').length || 0;
          const pending = deliveries?.filter(d => d.status === 'pending').length || 0;

          return { endpoint_id: endpoint.id, total, success, failed, pending };
        });

        const statsData = await Promise.all(statsPromises);
        setStats(statsData);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar webhooks",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (endpoint?: WebhookEndpoint) => {
    if (endpoint) {
      setEditingEndpoint(endpoint);
      setFormName(endpoint.name);
      setFormUrl(endpoint.url);
      setFormEvents(endpoint.events);
      setFormRetryCount(endpoint.retry_count);
      setFormTimeoutMs(endpoint.timeout_ms);
    } else {
      setEditingEndpoint(null);
      setFormName("");
      setFormUrl("");
      setFormEvents([]);
      setFormRetryCount(5);
      setFormTimeoutMs(30000);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName || !formUrl || formEvents.length === 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome, URL e selecione pelo menos um evento",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName,
        url: formUrl,
        events: formEvents,
        retry_count: formRetryCount,
        timeout_ms: formTimeoutMs
      };

      if (editingEndpoint) {
        const { error } = await supabase
          .from('webhook_endpoints')
          .update(payload)
          .eq('id', editingEndpoint.id);
        if (error) throw error;
        toast({ title: "Webhook atualizado com sucesso" });
      } else {
        const { error } = await supabase
          .from('webhook_endpoints')
          .insert(payload);
        if (error) throw error;
        toast({ title: "Webhook criado com sucesso" });
      }

      setDialogOpen(false);
      fetchEndpoints();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar webhook",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (endpoint: WebhookEndpoint) => {
    try {
      const { error } = await supabase
        .from('webhook_endpoints')
        .update({ is_enabled: !endpoint.is_enabled })
        .eq('id', endpoint.id);

      if (error) throw error;
      
      toast({
        title: endpoint.is_enabled ? "Webhook desativado" : "Webhook ativado"
      });
      
      fetchEndpoints();
    } catch (error: any) {
      toast({
        title: "Erro ao alterar status",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (endpoint: WebhookEndpoint) => {
    if (!confirm(`Tem certeza que deseja excluir o webhook "${endpoint.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('webhook_endpoints')
        .delete()
        .eq('id', endpoint.id);

      if (error) throw error;
      
      toast({ title: "Webhook excluído com sucesso" });
      fetchEndpoints();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir webhook",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast({ title: "Secret copiado!" });
  };

  const getEndpointStats = (endpointId: string) => {
    return stats.find(s => s.endpoint_id === endpointId) || { total: 0, success: 0, failed: 0, pending: 0 };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
            <p className="text-muted-foreground">
              Configure endpoints para receber notificações de eventos do sistema
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingEndpoint ? "Editar Webhook" : "Novo Webhook"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Meu ERP"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="url">URL do Webhook</Label>
                  <Input
                    id="url"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://seu-sistema.com/webhook"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Eventos</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto border rounded-md p-3">
                    {AVAILABLE_EVENTS.map((event) => (
                      <div key={event.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={event.id}
                          checked={formEvents.includes(event.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormEvents([...formEvents, event.id]);
                            } else {
                              setFormEvents(formEvents.filter(e => e !== event.id));
                            }
                          }}
                        />
                        <div className="grid gap-0.5 leading-none">
                          <label
                            htmlFor={event.id}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {event.name}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retryCount">Tentativas de Retry</Label>
                    <Input
                      id="retryCount"
                      type="number"
                      min={1}
                      max={10}
                      value={formRetryCount}
                      onChange={(e) => setFormRetryCount(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (ms)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={5000}
                      max={60000}
                      value={formTimeoutMs}
                      onChange={(e) => setFormTimeoutMs(parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <IntegrationWizard
          title="Assistente de configuração — Webhooks"
          steps={[
            {
              title: 'Crie um endpoint',
              description: 'Clique em "Novo Webhook" e informe um nome e a URL do sistema que vai receber os eventos.',
              done: endpoints.length > 0,
            },
            {
              title: 'Escolha os eventos',
              description: 'Selecione quais eventos serão enviados (pagamentos, assinaturas, ativos, clientes).',
              done: endpoints.some(e => (e.events?.length ?? 0) > 0),
            },
            {
              title: 'Valide a assinatura no seu sistema',
              description: 'Use o secret gerado para conferir o cabeçalho de assinatura HMAC-SHA256 de cada entrega.',
              done: endpoints.length > 0,
            },
            {
              title: 'Ative o endpoint e acompanhe as entregas',
              description: 'Ligue a chave do endpoint e confira o histórico de entregas para verificar sucessos e falhas.',
              done: endpoints.some(e => e.is_enabled),
            },
          ]}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : endpoints.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum webhook configurado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Configure webhooks para enviar notificações de eventos para sistemas externos
              </p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeiro webhook
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {endpoints.map((endpoint) => {
              const endpointStats = getEndpointStats(endpoint.id);
              return (
                <Card key={endpoint.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{endpoint.name}</CardTitle>
                          <Badge variant={endpoint.is_enabled ? "default" : "secondary"}>
                            {endpoint.is_enabled ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {endpoint.url}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={endpoint.is_enabled}
                          onCheckedChange={() => handleToggleEnabled(endpoint)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(endpoint)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/integrations/webhooks/${endpoint.id}/logs`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(endpoint)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center p-2 bg-muted rounded-lg">
                        <div className="text-2xl font-bold">{endpointStats.total}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                      <div className="text-center p-2 bg-green-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{endpointStats.success}</div>
                        <div className="text-xs text-muted-foreground">Sucesso</div>
                      </div>
                      <div className="text-center p-2 bg-red-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{endpointStats.failed}</div>
                        <div className="text-xs text-muted-foreground">Falhas</div>
                      </div>
                      <div className="text-center p-2 bg-yellow-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">{endpointStats.pending}</div>
                        <div className="text-xs text-muted-foreground">Pendentes</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {endpoint.events.map((event) => (
                        <Badge key={event} variant="outline" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Secret:</span>
                      <code className="bg-muted px-2 py-1 rounded text-xs">
                        {endpoint.secret.substring(0, 12)}...
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copySecret(endpoint.secret)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Documentação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documentação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Validação de Assinatura</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Cada webhook enviado inclui um header <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> para validação:
              </p>
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
{`const crypto = require('crypto');
const signature = req.headers['x-webhook-signature'];
const [tPart, vPart] = signature.split(',');
const timestamp = tPart.split('=')[1];
const receivedSig = vPart.split('=')[1];

const payload = timestamp + '.' + JSON.stringify(req.body);
const expectedSig = crypto
  .createHmac('sha256', YOUR_SECRET)
  .update(payload)
  .digest('hex');

const isValid = receivedSig === expectedSig;`}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">Formato do Payload</h4>
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
{`{
  "id": "evt_abc123...",
  "type": "payment.completed",
  "created_at": "2025-12-30T21:00:00Z",
  "data": {
    "object": "payment",
    "id": "pay_xyz789...",
    "amount": 99.90,
    ...
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default WebhooksSettings;