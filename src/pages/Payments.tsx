import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Receipt, 
  Calendar,
  DollarSign,
  CreditCard,
  QrCode,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Plus
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Tables } from '@/integrations/supabase/types';

type Payment = Tables<'payments'> & {
  subscriptions?: { 
    plan_name: string;
    assets?: { name: string; clients?: { name: string } | null } | null 
  } | null;
};

type Subscription = {
  id: string;
  plan_name: string;
  monthly_value: number;
  assets?: { name: string; clients?: { name: string } | null } | null;
};

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    subscription_id: '',
    amount: '',
    payment_method: 'pix' as 'pix' | 'card',
    status: 'completed' as 'pending' | 'completed',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchPayments();
    fetchSubscriptions();
  }, []);

  async function fetchSubscriptions() {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          id,
          plan_name,
          monthly_value,
          assets (
            name,
            clients (name)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    }
  }

  async function fetchPayments() {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          subscriptions (
            plan_name,
            assets (
              name,
              clients (name)
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredPayments = payments.filter(payment => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      payment.subscriptions?.plan_name?.toLowerCase().includes(searchLower) ||
      payment.subscriptions?.assets?.name?.toLowerCase().includes(searchLower) ||
      payment.subscriptions?.assets?.clients?.name?.toLowerCase().includes(searchLower);
    
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const subscription = subscriptions.find(s => s.id === formData.subscription_id);
      if (!subscription) throw new Error('Assinatura não encontrada');

      const paymentData = {
        subscription_id: formData.subscription_id,
        amount: parseFloat(formData.amount) || subscription.monthly_value,
        payment_method: formData.payment_method,
        status: formData.status,
        paid_at: formData.status === 'completed' ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('payments')
        .insert(paymentData);

      if (error) throw error;

      // If payment is completed and subscription was overdue, reactivate
      if (formData.status === 'completed') {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, asset_id')
          .eq('id', formData.subscription_id)
          .single();

        if (sub && sub.status === 'overdue') {
          await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('id', formData.subscription_id);

          await supabase
            .from('assets')
            .update({ status: 'active', block_reason: null })
            .eq('id', sub.asset_id);
        }
      }

      toast({ title: 'Pagamento registrado!' });
      setIsDialogOpen(false);
      setFormData({
        subscription_id: '',
        amount: '',
        payment_method: 'pix',
        status: 'completed',
      });
      fetchPayments();
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro ao registrar pagamento',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'failed':
      case 'refunded':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-primary/20 text-primary';
      case 'pending':
        return 'bg-warning/20 text-warning';
      case 'failed':
        return 'bg-destructive/20 text-destructive';
      case 'refunded':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Pago';
      case 'pending':
        return 'Pendente';
      case 'failed':
        return 'Falhou';
      case 'refunded':
        return 'Reembolsado';
      default:
        return status;
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'pix':
        return <QrCode className="w-4 h-4" />;
      case 'card':
        return <CreditCard className="w-4 h-4" />;
      default:
        return <Receipt className="w-4 h-4" />;
    }
  };

  const stats = {
    total: payments.length,
    completed: payments.filter(p => p.status === 'completed').length,
    pending: payments.filter(p => p.status === 'pending').length,
    totalAmount: payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + Number(p.amount), 0),
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Pagamentos</h1>
            <p className="text-muted-foreground mt-1">
              Visualize e registre pagamentos
            </p>
          </div>
          <Button variant="glow" onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Pagamento</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Pagos</p>
            <p className="text-2xl font-bold text-primary">{stats.completed}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-warning">{stats.pending}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Receita</p>
            <p className="text-2xl font-bold text-primary">
              R$ {stats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pagamentos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Pagos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="failed">Falhos</SelectItem>
              <SelectItem value="refunded">Reembolsados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Payments List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum pagamento encontrado
            </h3>
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all' 
                ? 'Tente outros filtros' 
                : 'Os pagamentos aparecerão aqui'}
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Plano</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Método</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Valor</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Data</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">
                            {payment.subscriptions?.assets?.clients?.name || '-'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {payment.subscriptions?.assets?.name || '-'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 text-foreground">
                        {payment.subscriptions?.plan_name || '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {getMethodIcon(payment.payment_method)}
                          <span className="capitalize">{payment.payment_method}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-foreground">
                          R$ {Number(payment.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {payment.paid_at 
                          ? new Date(payment.paid_at).toLocaleDateString('pt-BR')
                          : new Date(payment.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
                          getStatusColor(payment.status)
                        )}>
                          {getStatusIcon(payment.status)}
                          {getStatusLabel(payment.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Pagamento</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreatePayment} className="space-y-4">
              <div className="space-y-2">
                <Label>Assinatura</Label>
                <Select
                  value={formData.subscription_id}
                  onValueChange={(value) => {
                    const sub = subscriptions.find(s => s.id === value);
                    setFormData({ 
                      ...formData, 
                      subscription_id: value,
                      amount: sub ? sub.monthly_value.toString() : ''
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma assinatura" />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriptions.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.plan_name} - {sub.assets?.clients?.name || sub.assets?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Método de Pagamento</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(value: 'pix' | 'card') => 
                    setFormData({ ...formData, payment_method: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'pending' | 'completed') => 
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Pago</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="glow" className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Registrar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}