import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2, Loader2, Eye, Copy, Globe, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface Asset {
  id: string;
  name: string;
  type: string;
  public_key: string;
  status: string;
  block_reason: string | null;
  client_id: string;
  created_at: string;
  clients?: {
    name: string;
  };
}

interface Client {
  id: string;
  name: string;
}

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'custom' as 'wordpress' | 'shopify' | 'custom' | 'other' | 'infoproduct',
    client_id: '',
    status: 'active' as 'active' | 'blocked',
    block_reason: '',
    infoproduct_url: '',
    stripe_price_id: '',
  });
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const [assetsRes, clientsRes] = await Promise.all([
        supabase.from('assets').select('*, clients(name)').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name'),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setAssets(assetsRes.data || []);
      setClients(clientsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        client_id: formData.client_id,
        status: formData.status,
        block_reason: formData.status === 'blocked' ? formData.block_reason : null,
        infoproduct_url: formData.type === 'infoproduct' ? formData.infoproduct_url : null,
      };

      if (editingAsset) {
        const { error } = await supabase
          .from('assets')
          .update(payload)
          .eq('id', editingAsset.id);

        if (error) throw error;
        toast({ title: 'Ativo atualizado!' });
      } else {
        const { error } = await supabase
          .from('assets')
          .insert([payload]);

        if (error) throw error;
        toast({ title: 'Ativo criado!' });
      }

      setIsDialogOpen(false);
      setEditingAsset(null);
      setFormData({ name: '', type: 'custom', client_id: '', status: 'active', block_reason: '', infoproduct_url: '' });
      fetchData();
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

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      type: asset.type as 'wordpress' | 'shopify' | 'custom' | 'other' | 'infoproduct',
      client_id: asset.client_id,
      status: asset.status as 'active' | 'blocked',
      block_reason: asset.block_reason || '',
      infoproduct_url: (asset as any).infoproduct_url || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este ativo?')) return;

    try {
      const { error } = await supabase.from('assets').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Ativo excluído!' });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const copyPublicKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Chave copiada!' });
  };

  const filteredAssets = assets.filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.clients?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const typeLabels: Record<string, string> = {
    wordpress: 'WordPress',
    shopify: 'Shopify',
    custom: 'Custom',
    other: 'Outro',
    infoproduct: 'Infoproduto',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Ativos</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie sites e sistemas
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingAsset(null);
              setFormData({ name: '', type: 'custom', client_id: '', status: 'active', block_reason: '', infoproduct_url: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="w-4 h-4" />
                Novo Ativo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>
                  {editingAsset ? 'Editar Ativo' : 'Novo Ativo'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Ativo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client">Cliente</Label>
                  <select
                    id="client"
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                    required
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any, infoproduct_url: '' })}
                    className="flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                  >
                    <option value="infoproduct">Infoproduto</option>
                    <option value="wordpress">WordPress</option>
                    <option value="shopify">Shopify</option>
                    <option value="custom">Custom</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                  >
                    <option value="active">Ativo</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </div>
                {formData.type === 'infoproduct' && (
                  <div className="space-y-2">
                    <Label htmlFor="infoproduct_url">Link do Infoproduto</Label>
                    <Input
                      id="infoproduct_url"
                      value={formData.infoproduct_url}
                      onChange={(e) => setFormData({ ...formData, infoproduct_url: e.target.value })}
                      placeholder="https://exemplo.com/curso"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Link para onde o cliente será redirecionado após o pagamento
                    </p>
                  </div>
                )}
                {formData.status === 'blocked' && (
                  <div className="space-y-2">
                    <Label htmlFor="block_reason">Motivo do Bloqueio</Label>
                    <Input
                      id="block_reason"
                      value={formData.block_reason}
                      onChange={(e) => setFormData({ ...formData, block_reason: e.target.value })}
                      placeholder="Ex: Pagamento pendente"
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingAsset ? 'Salvar Alterações' : 'Criar Ativo'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ativos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))
          ) : filteredAssets.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Nenhum ativo encontrado
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <div key={asset.id} className="glass-card p-6 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {asset.type === 'infoproduct' ? (
                        <Package className="w-5 h-5 text-primary" />
                      ) : (
                        <Globe className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{asset.name}</h3>
                      <p className="text-sm text-muted-foreground">{asset.clients?.name}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "status-badge",
                    asset.status === 'active' ? 'status-active' : 'status-blocked'
                  )}>
                    {asset.status === 'active' ? 'Ativo' : 'Bloqueado'}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="text-foreground">{typeLabels[asset.type]}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Public Key:</span>
                    <button
                      onClick={() => copyPublicKey(asset.public_key)}
                      className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      <span className="font-mono text-xs">{asset.public_key.slice(0, 8)}...</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/assets/${asset.id}`)}
                  >
                    <Eye className="w-4 h-4" />
                    Detalhes
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(asset)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(asset.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
