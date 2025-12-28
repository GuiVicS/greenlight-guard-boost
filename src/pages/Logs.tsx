import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  FileText, 
  Globe,
  Eye,
  Lock,
  Unlock,
  Loader2,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Tables } from '@/integrations/supabase/types';

type AccessLog = Tables<'access_logs'> & {
  assets?: { name: string } | null;
};

export default function Logs() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select(`
          *,
          assets (name)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      log.action.toLowerCase().includes(searchLower) ||
      log.assets?.name?.toLowerCase().includes(searchLower) ||
      log.ip_address?.toLowerCase().includes(searchLower);
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    
    return matchesSearch && matchesAction;
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'check':
        return <Eye className="w-4 h-4" />;
      case 'block':
        return <Lock className="w-4 h-4" />;
      case 'unblock':
        return <Unlock className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'check':
        return 'bg-muted text-muted-foreground';
      case 'block':
        return 'bg-destructive/20 text-destructive';
      case 'unblock':
        return 'bg-primary/20 text-primary';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'check':
        return 'Verificação';
      case 'block':
        return 'Bloqueio';
      case 'unblock':
        return 'Desbloqueio';
      default:
        return action;
    }
  };

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Logs de Acesso</h1>
          <p className="text-muted-foreground mt-1">
            Visualize o histórico de verificações e bloqueios
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Total de Logs</p>
            <p className="text-2xl font-bold text-foreground">{logs.length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Verificações</p>
            <p className="text-2xl font-bold text-muted-foreground">
              {logs.filter(l => l.action === 'check').length}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Bloqueios</p>
            <p className="text-2xl font-bold text-destructive">
              {logs.filter(l => l.action === 'block').length}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Desbloqueios</p>
            <p className="text-2xl font-bold text-primary">
              {logs.filter(l => l.action === 'unblock').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {uniqueActions.map(action => (
                <SelectItem key={action} value={action}>
                  {getActionLabel(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Logs List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum log encontrado
            </h3>
            <p className="text-muted-foreground">
              {searchTerm || actionFilter !== 'all' 
                ? 'Tente outros filtros' 
                : 'Os logs aparecerão aqui quando houver atividade'}
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Data/Hora</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Ativo</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Ação</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">IP</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">User Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">{log.assets?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
                          getActionColor(log.action)
                        )}>
                          {getActionIcon(log.action)}
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground font-mono">
                        {log.ip_address || '-'}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground max-w-xs truncate">
                        {log.user_agent || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}