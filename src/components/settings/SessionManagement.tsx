import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Monitor, Smartphone, Tablet, LogOut, Loader2, Shield } from 'lucide-react';

export function SessionManagement() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const getDeviceIcon = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="w-5 h-5" />;
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return <Tablet className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  const getDeviceName = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    
    // Browser detection
    let browser = 'Navegador desconhecido';
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

    // OS detection
    let os = '';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux') && !ua.includes('android')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return `${browser}${os ? ` em ${os}` : ''}`;
  };

  const revokeOtherSessions = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Erro',
          description: 'Você não está autenticado',
          variant: 'destructive',
        });
        return;
      }

      const response = await supabase.functions.invoke('manage-sessions', {
        body: { action: 'revoke-others' },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast({
        title: 'Sucesso',
        description: 'Outras sessões foram encerradas. Você continua logado neste dispositivo.',
      });
    } catch (error) {
      console.error('Error revoking sessions:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Falha ao encerrar sessões',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeAllSessions = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Erro',
          description: 'Você não está autenticado',
          variant: 'destructive',
        });
        return;
      }

      const response = await supabase.functions.invoke('manage-sessions', {
        body: { action: 'revoke', sessionId: 'all' },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Sign out locally after revoking all
      await supabase.auth.signOut();
      
      toast({
        title: 'Sucesso',
        description: 'Todas as sessões foram encerradas. Faça login novamente.',
      });
    } catch (error) {
      console.error('Error revoking all sessions:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Falha ao encerrar sessões',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Get current device info
  const currentUserAgent = navigator.userAgent;
  const currentDevice = getDeviceName(currentUserAgent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Segurança da Conta
        </CardTitle>
        <CardDescription>
          Gerencie as sessões ativas e dispositivos conectados à sua conta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Session */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Sessão Atual</h4>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-primary/20">
            <div className="flex items-center gap-3">
              {getDeviceIcon(currentUserAgent)}
              <div>
                <p className="font-medium">{currentDevice}</p>
                <p className="text-xs text-muted-foreground">Este dispositivo</p>
              </div>
            </div>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
              Ativo agora
            </span>
          </div>
        </div>

        {/* Session Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Ações de Segurança</h4>
          
          <div className="space-y-3">
            {/* Revoke Other Sessions */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  Deslogar de outros dispositivos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deslogar outros dispositivos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá encerrar todas as outras sessões ativas, mantendo apenas a sessão atual neste dispositivo. 
                    Qualquer pessoa usando sua conta em outros dispositivos será desconectada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={revokeOtherSessions}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Revoke All Sessions */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="w-full justify-start gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  Deslogar de todos os dispositivos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deslogar de todos os dispositivos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá encerrar TODAS as sessões, incluindo esta. 
                    Você será desconectado e precisará fazer login novamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={revokeAllSessions}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Deslogar de Todos
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Security Tips */}
        <div className="p-4 bg-muted/20 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Dicas de Segurança</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Use esta opção se suspeitar que sua conta foi acessada sem autorização</li>
            <li>• Recomendamos trocar sua senha após encerrar sessões suspeitas</li>
            <li>• Sempre faça logout ao usar dispositivos públicos ou compartilhados</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
