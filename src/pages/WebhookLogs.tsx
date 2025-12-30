import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Eye, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  payload: Json;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
}

const WebhookLogs = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    try {
      // Buscar endpoint
      const { data: endpointData, error: endpointError } = await supabase
        .from('webhook_endpoints')
        .select('id, name, url')
        .eq('id', id)
        .single();

      if (endpointError) throw endpointError;
      setEndpoint(endpointData);

      // Buscar deliveries
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('webhook_deliveries')
        .select('*')
        .eq('endpoint_id', id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (deliveriesError) throw deliveriesError;
      setDeliveries(deliveriesData || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (delivery: WebhookDelivery) => {
    setResending(delivery.id);
    try {
      // Resetar delivery para pendente
      const { error } = await supabase
        .from('webhook_deliveries')
        .update({
          status: 'pending',
          attempt_count: 0,
          next_retry_at: new Date().toISOString(),
          error_message: null,
          response_status: null,
          response_body: null
        })
        .eq('id', delivery.id);

      if (error) throw error;

      toast({ title: "Webhook reenfileirado para envio" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao reenviar webhook",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setResending(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Sucesso</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!endpoint) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Webhook não encontrado</p>
          <Button variant="link" onClick={() => navigate('/integrations/webhooks')}>
            Voltar para webhooks
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/integrations/webhooks')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{endpoint.name}</h1>
            <p className="text-muted-foreground">{endpoint.url}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Histórico de Entregas</CardTitle>
                <CardDescription>
                  Últimas 100 entregas de webhook
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma entrega registrada ainda
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Entregue em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <Badge variant="outline">{delivery.event_type}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                      <TableCell>
                        {delivery.attempt_count}/{delivery.max_attempts}
                      </TableCell>
                      <TableCell>
                        {delivery.response_status ? (
                          <Badge 
                            variant={delivery.response_status < 400 ? "default" : "destructive"}
                          >
                            {delivery.response_status}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(delivery.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(delivery.delivered_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedDelivery(delivery)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {delivery.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResend(delivery)}
                              disabled={resending === delivery.id}
                            >
                              {resending === delivery.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Modal de detalhes */}
        <Dialog open={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Entrega</DialogTitle>
            </DialogHeader>
            {selectedDelivery && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Event ID</label>
                    <p className="text-sm font-mono">{selectedDelivery.event_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                    <p>{selectedDelivery.event_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedDelivery.status)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">HTTP Status</label>
                    <p>{selectedDelivery.response_status || "-"}</p>
                  </div>
                </div>

                {selectedDelivery.error_message && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Erro</label>
                    <p className="text-sm text-destructive">{selectedDelivery.error_message}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payload Enviado</label>
                  <pre className="mt-1 bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-60">
                    {JSON.stringify(selectedDelivery.payload, null, 2)}
                  </pre>
                </div>

                {selectedDelivery.response_body && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Resposta</label>
                    <pre className="mt-1 bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-40">
                      {selectedDelivery.response_body}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-muted-foreground">Criado em</label>
                    <p>{formatDate(selectedDelivery.created_at)}</p>
                  </div>
                  <div>
                    <label className="text-muted-foreground">Última tentativa</label>
                    <p>{formatDate(selectedDelivery.last_attempt_at)}</p>
                  </div>
                  <div>
                    <label className="text-muted-foreground">Entregue em</label>
                    <p>{formatDate(selectedDelivery.delivered_at)}</p>
                  </div>
                  <div>
                    <label className="text-muted-foreground">Próximo retry</label>
                    <p>{formatDate(selectedDelivery.next_retry_at)}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default WebhookLogs;