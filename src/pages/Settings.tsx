import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { SessionManagement } from '@/components/settings/SessionManagement';
import { useTheme } from 'next-themes';
import { 
  Settings as SettingsIcon, 
  Users, 
  Plus,
  Trash2,
  Loader2,
  Shield,
  Mail,
  Globe,
  Save,
  Sun,
  Moon,
  Monitor
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UserWithRole {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  created_at: string;
}

export default function Settings() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'staff',
  });
  const [saving, setSaving] = useState(false);
  
  // App settings state
  const [checkoutBaseUrl, setCheckoutBaseUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (userRole === 'admin') {
      fetchUsers();
      fetchAppSettings();
    } else {
      setLoading(false);
    }
  }, [userRole]);

  async function fetchAppSettings() {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();
      
      if (data && !error) {
        setCheckoutBaseUrl(data.checkout_base_url || '');
      }
    } catch (error) {
      console.error('Error fetching app settings:', error);
    }
  }

  async function saveAppSettings() {
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ checkout_base_url: checkoutBaseUrl })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows
      
      if (error) throw error;
      
      toast({ title: 'Configurações salvas!' });
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro ao salvar configurações',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get profile info for each user
      const usersWithProfiles = await Promise.all(
        (data || []).map(async (userRole) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userRole.user_id)
            .maybeSingle();

          return {
            id: userRole.user_id,
            email: profile?.full_name || 'Usuário',
            role: userRole.role as 'admin' | 'staff',
            created_at: userRole.created_at,
          };
        })
      );

      setUsers(usersWithProfiles);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Create user via Supabase auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.email.split('@')[0],
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Falha ao criar usuário');

      // Add role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role: formData.role,
        });

      if (roleError) throw roleError;

      toast({ title: 'Usuário criado com sucesso!' });
      setIsDialogOpen(false);
      setFormData({ email: '', password: '', role: 'staff' });
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro ao criar usuário',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deleteUserId);

      if (error) throw error;

      toast({ title: 'Usuário removido!' });
      setDeleteUserId(null);
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro ao remover usuário',
        variant: 'destructive',
      });
    }
  };

  if (userRole !== 'admin') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">Acesso Restrito</h2>
          <p className="text-muted-foreground mt-2">
            Apenas administradores podem acessar as configurações.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie usuários e configurações do sistema
          </p>
        </div>

        {/* User Management */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Gerenciamento de Usuários</h3>
                <p className="text-sm text-muted-foreground">
                  Adicione ou remova usuários do sistema
                </p>
              </div>
            </div>
            <Button variant="glow" onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Usuário</span>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-4 bg-muted/20 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{u.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium",
                      u.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {u.role === 'admin' ? 'Admin' : 'Staff'}
                    </span>
                    {u.id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteUserId(u.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout Settings */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Configurações do Checkout</h3>
              <p className="text-sm text-muted-foreground">
                Configure a URL base para o checkout de pagamentos
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL Base do Checkout</Label>
              <Input
                value={checkoutBaseUrl}
                onChange={(e) => setCheckoutBaseUrl(e.target.value)}
                placeholder="https://seudominio.com"
              />
              <p className="text-xs text-muted-foreground">
                Esta URL será usada para gerar os links de pagamento no overlay de bloqueio.
                Exemplo: https://seuapp.lovable.app
              </p>
            </div>
            
            <Button 
              variant="glow" 
              onClick={saveAppSettings}
              disabled={savingSettings}
            >
              {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              Salvar Configurações
            </Button>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sun className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Tema do Painel</h3>
              <p className="text-sm text-muted-foreground">
                Escolha o tema de aparência do painel administrativo
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={cn(
                "flex-1 p-4 rounded-lg border-2 transition-all",
                "flex flex-col items-center gap-2",
                theme === 'light' 
                  ? "border-primary bg-primary/10" 
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="w-12 h-8 bg-white border border-border rounded shadow-sm flex items-center justify-center">
                <Sun className="w-4 h-4 text-amber-500" />
              </div>
              <span className="text-sm font-medium">Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={cn(
                "flex-1 p-4 rounded-lg border-2 transition-all",
                "flex flex-col items-center gap-2",
                theme === 'dark' 
                  ? "border-primary bg-primary/10" 
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="w-12 h-8 bg-slate-900 border border-slate-700 rounded shadow-sm flex items-center justify-center">
                <Moon className="w-4 h-4 text-slate-300" />
              </div>
              <span className="text-sm font-medium">Dark</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={cn(
                "flex-1 p-4 rounded-lg border-2 transition-all",
                "flex flex-col items-center gap-2",
                theme === 'system' 
                  ? "border-primary bg-primary/10" 
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="w-12 h-8 bg-gradient-to-r from-white to-slate-900 border border-border rounded shadow-sm flex items-center justify-center">
                <Monitor className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">Sistema</span>
            </button>
          </div>
        </div>

        {/* Session Management */}
        <SessionManagement />

        {/* System Info */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Informações do Sistema</h3>
              <p className="text-sm text-muted-foreground">
                Detalhes sobre a configuração atual
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground">Versão</p>
              <p className="text-lg font-medium text-foreground">1.0.0</p>
            </div>
            <div className="p-4 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground">Ambiente</p>
              <p className="text-lg font-medium text-foreground">Produção</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemplo.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Função</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'admin' | 'staff') => 
                  setFormData({ ...formData, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
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
                Criar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
