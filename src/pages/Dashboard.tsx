import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Globe, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Stats {
  activeAssets: number;
  blockedAssets: number;
  monthlyRevenue: number;
  overdueCount: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    activeAssets: 0,
    blockedAssets: 0,
    monthlyRevenue: 0,
    overdueCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [activeRes, blockedRes, subscriptionsRes] = await Promise.all([
          supabase.from('assets').select('id', { count: 'exact' }).eq('status', 'active'),
          supabase.from('assets').select('id', { count: 'exact' }).eq('status', 'blocked'),
          supabase.from('subscriptions').select('monthly_value, status'),
        ]);

        const activeAssets = activeRes.count || 0;
        const blockedAssets = blockedRes.count || 0;
        
        const subscriptions = subscriptionsRes.data || [];
        const monthlyRevenue = subscriptions
          .filter(s => s.status === 'active')
          .reduce((sum, s) => sum + Number(s.monthly_value), 0);
        const overdueCount = subscriptions.filter(s => s.status === 'overdue').length;

        setStats({
          activeAssets,
          blockedAssets,
          monthlyRevenue,
          overdueCount,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Ativos Ativos',
      value: stats.activeAssets,
      icon: Globe,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Ativos Bloqueados',
      value: stats.blockedAssets,
      icon: AlertTriangle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Receita Mensal',
      value: `R$ ${stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Inadimplência',
      value: stats.overdueCount,
      icon: TrendingUp,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do seu sistema de gerenciamento
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <div
              key={stat.title}
              className={cn(
                "stat-card animate-fade-up",
                loading && "animate-pulse"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">{stat.title}</p>
                  <p className="stat-value mt-2">
                    {loading ? '—' : stat.value}
                  </p>
                </div>
                <div className={cn("p-3 rounded-xl", stat.bgColor)}>
                  <stat.icon className={cn("w-6 h-6", stat.color)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a 
              href="/clients" 
              className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                Adicionar Cliente
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Cadastre um novo cliente no sistema
              </p>
            </a>
            <a 
              href="/assets" 
              className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                Gerenciar Ativos
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Visualize e gerencie sites e sistemas
              </p>
            </a>
            <a 
              href="/subscriptions" 
              className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                Ver Assinaturas
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Acompanhe pagamentos e renovações
              </p>
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
