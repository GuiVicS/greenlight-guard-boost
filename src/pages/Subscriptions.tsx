import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Search, 
  CreditCard, 
  Calendar,
  DollarSign,
  MoreHorizontal,
  Loader2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Tables } from '@/integrations/supabase/types';

type Subscription = Tables<'subscriptions'> & {
  assets?: { name: string; client_id: string; clients?: { name: string } | null } | null;
};

type Asset = Tables<'assets'>;

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [formData, setFormData] = useState({
    asset_id: '',
    plan_name: '',
    monthly_value: '',
    due_date: '',
    status: 'active' as 'active' | 'overdue' | 'cancelled',
    country: 'BR',
    stripe_recurring: true,
  });
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscriptions();
    fetchAssets();
    fetchStripeSettings();
  }, []);

  async function fetchSubscriptions() {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          assets (
            name,
            client_id,
            clients (name)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssets() {
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .order('name');

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error('Error fetching assets:', error);
    }
  }

  async function fetchStripeSettings() {
    try {
      const { data, error } = await supabase
        .from('stripe_settings')
        .select('is_enabled, is_configured')
        .maybeSingle();

      if (error) throw error;
      setStripeEnabled(!!data?.is_enabled);
      setStripeConfigured(!!data?.is_configured);
    } catch (error) {
      console.error('Error fetching Stripe settings:', error);
    }
  }

  const filteredSubscriptions = subscriptions.filter(sub => {
    const searchLower = searchTerm.toLowerCase();
    return (
      sub.plan_name.toLowerCase().includes(searchLower) ||
      sub.assets?.name?.toLowerCase().includes(searchLower) ||
      sub.assets?.clients?.name?.toLowerCase().includes(searchLower)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStripeLoading(true);

    try {
      let stripePriceId: string | null = null;

      // If Stripe recurring is enabled, create or reuse Stripe product/price
      if (formData.stripe_recurring && stripeEnabled && stripeConfigured) {
        const selectedAsset = assets.find(a => a.id === formData.asset_id);

        if (selectedAsset?.stripe_price_id) {
          stripePriceId = selectedAsset.stripe_price_id;
        } else {
          const { data, error } = await supabase.functions.invoke('create-stripe-recurring-price', {
            body: {
              assetId: formData.asset_id,
              planName: formData.plan_name,
              monthlyValue: parseFloat(formData.monthly_value),
              country: (selectedAsset as any)?.checkout_mode === 'global' ? 'US' : formData.country,
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          stripePriceId = data?.priceId || null;
        }
      }

      const subscriptionData: any = {
        asset_id: formData.asset_id,
        plan_name: formData.plan_name,
        monthly_value: parseFloat(formData.monthly_value),
        due_date: formData.due_date,
        status: formData.status,
        country: formData.country,
      };

      if (stripePriceId) {
        subscriptionData.stripe_price_id = stripePriceId;
      }

      if (editingSubscription) {
        const { error } = await supabase
          .from('subscriptions')
          .update(subscriptionData)
          .eq('id', editingSubscription.id);

        if (error) throw error;
        toast({ title: 'Assinatura atualizada!' });
      } else {
        const { error } = await supabase
          .from('subscriptions')
          .insert(subscriptionData);

        if (error) throw error;
        toast({ title: 'Assinatura criada!' });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchSubscriptions();
      fetchAssets();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar assinatura',
        variant: 'destructive',
      });
    } finally {
      setStripeLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      asset_id: '',
      plan_name: '',
      monthly_value: '',
      due_date: '',
      status: 'active',
      country: 'BR',
      stripe_recurring: true,
    });
    setEditingSubscription(null);
  };

  const openEditDialog = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    setFormData({
      asset_id: subscription.asset_id,
      plan_name: subscription.plan_name,
      monthly_value: subscription.monthly_value.toString(),
      due_date: subscription.due_date,
      status: subscription.status,
      country: (subscription as any).country || 'BR',
      stripe_recurring: !!(subscription as any).stripe_price_id,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta assinatura?')) return;

    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Assinatura excluída!' });
      fetchSubscriptions();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-primary/20 text-primary';
      case 'overdue':
        return 'bg-warning/20 text-warning';
      case 'cancelled':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Ativa';
      case 'overdue':
        return 'Atrasada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Assinaturas</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie as assinaturas dos seus clientes
            </p>
          </div>
          <Button variant="glow" onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Assinatura</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar assinaturas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Subscriptions List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhuma assinatura encontrada
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? 'Tente outra busca' : 'Adicione sua primeira assinatura'}
            </p>
            {!searchTerm && (
              <Button variant="glow" onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4" />
                Nova Assinatura
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredSubscriptions.map((subscription) => (
              <div key={subscription.id} className="glass-card p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{subscription.plan_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {subscription.assets?.name} • {subscription.assets?.clients?.name}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground font-medium">
                        R$ {Number(subscription.monthly_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {new Date(subscription.due_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium",
                      getStatusColor(subscription.status)
                    )}>
                      {getStatusLabel(subscription.status)}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(subscription)}>
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(subscription.id)}
                          className="text-destructive"
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingSubscription ? 'Editar Assinatura' : 'Nova Assinatura'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Ativo</Label>
                <Select
                  value={formData.asset_id}
                  onValueChange={(value) => setFormData({ ...formData, asset_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um ativo" />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {asset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nome do Plano</Label>
                <Input
                  value={formData.plan_name}
                  onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                  placeholder="Ex: Plano Mensal"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Valor Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.monthly_value}
                  onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>País</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o país" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BR">🇧🇷 Brasil</SelectItem>
                    <SelectItem value="US">🇺🇸 Estados Unidos</SelectItem>
                    <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                    <SelectItem value="ES">🇪🇸 Espanha</SelectItem>
                    <SelectItem value="MX">🇲🇽 México</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {stripeEnabled && stripeConfigured && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Cobrar recorrente pela Stripe</Label>
                    <p className="text-xs text-muted-foreground">
                      Cria um produto/plano mensal na Stripe e vincula automaticamente o price_id.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.stripe_recurring}
                    onChange={(e) => setFormData({ ...formData, stripe_recurring: e.target.checked })}
                    className="h-5 w-5 accent-primary"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'active' | 'overdue' | 'cancelled') => 
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="overdue">Atrasada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
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
                <Button type="submit" variant="glow" className="flex-1" disabled={stripeLoading}>
                  {stripeLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editingSubscription ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}