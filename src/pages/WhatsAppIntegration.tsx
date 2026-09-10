import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import whatsappLogo from '@/assets/whatsapp-logo.png';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Key,
  Link2,
  QrCode,
  LogOut,
  Trash2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

type ConnectionState = 'close' | 'connecting' | 'open';

interface EvolutionSettingsView {
  hasCredentials: boolean;
  serverUrl: string;
  instanceName: string | null;
  connectionState: ConnectionState;
  connectedNumber: string | null;
  profileName: string | null;
  isConfigured: boolean;
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 90000;

export default function WhatsAppIntegration() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [working, setWorking] = useState(false);

  const [settings, setSettings] = useState<EvolutionSettingsView | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);

  const pollRef = useRef<number | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const callFunction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const { data, error } = await supabase.functions.invoke('evolution-instance', {
        body: { action, ...payload },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error as string);
      return data as Record<string, unknown>;
    },
    [],
  );

  const loadSettings = useCallback(async () => {
    try {
      const data = await callFunction('get');
      const s = data.settings as EvolutionSettingsView;
      setSettings(s);
      setServerUrl(s.serverUrl || '');
      if (s.instanceName) {
        const status = await callFunction('status');
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                connectionState: (status.connectionState as ConnectionState) || 'close',
                connectedNumber: (status.connectedNumber as string) ?? prev.connectedNumber,
                profileName: (status.profileName as string) ?? prev.profileName,
              }
            : prev,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [callFunction, toast]);

  useEffect(() => {
    loadSettings();
    return () => stopPolling();
  }, [loadSettings, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollStartRef.current = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        setQrExpired(true);
        setQrCode(null);
        return;
      }
      try {
        const status = await callFunction('status');
        const state = (status.connectionState as ConnectionState) || 'close';
        if (state === 'open') {
          stopPolling();
          setQrCode(null);
          setPairingCode(null);
          setQrExpired(false);
          setSettings((prev) =>
            prev
              ? {
                  ...prev,
                  connectionState: 'open',
                  connectedNumber: (status.connectedNumber as string) ?? null,
                  profileName: (status.profileName as string) ?? null,
                }
              : prev,
          );
          toast({ title: 'WhatsApp conectado com sucesso!' });
        }
      } catch {
        /* mantém o polling ativo em falhas momentâneas */
      }
    }, POLL_INTERVAL_MS);
  }, [callFunction, stopPolling, toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await callFunction('save', { serverUrl, apiKey });
      setSettings(data.settings as EvolutionSettingsView);
      setApiKey('');
      toast({ title: 'Credenciais salvas com sucesso!' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setQrExpired(false);
    setQrCode(null);
    setPairingCode(null);
    try {
      const data = await callFunction('connect');
      setQrCode((data.qrcode as string) ?? null);
      setPairingCode((data.pairingCode as string) ?? null);
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              instanceName: (data.instanceName as string) ?? prev.instanceName,
              connectionState: 'connecting',
            }
          : prev,
      );
      startPolling();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao conectar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    setWorking(true);
    try {
      await callFunction('logout');
      stopPolling();
      setQrCode(null);
      setSettings((prev) =>
        prev ? { ...prev, connectionState: 'close', connectedNumber: null, profileName: null } : prev,
      );
      toast({ title: 'WhatsApp desconectado' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao desconectar';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleRemove = async () => {
    setWorking(true);
    try {
      await callFunction('delete');
      stopPolling();
      setQrCode(null);
      setSettings((prev) =>
        prev
          ? { ...prev, instanceName: null, connectionState: 'close', connectedNumber: null, profileName: null }
          : prev,
      );
      toast({ title: 'Integração removida' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao remover';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
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

  const state = settings?.connectionState ?? 'close';
  const statusLabel =
    state === 'open' ? 'Conectado' : state === 'connecting' ? 'Aguardando leitura do QR Code' : 'Desconectado';

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/integrations')} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Integrações
        </Button>

        <div className="flex items-center gap-4">
          <img src={whatsappLogo} alt="Logo do WhatsApp" className="w-12 h-12 rounded-lg object-contain" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">WhatsApp</h1>
            <p className="text-muted-foreground mt-1">Conecte seu número via Evolution API</p>
          </div>
        </div>

        {/* Status */}
        <div
          className={cn(
            'glass-card p-6 flex items-center gap-4',
            state === 'open' ? 'border-primary/30' : 'border-warning/30',
          )}
        >
          <div
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center',
              state === 'open' ? 'bg-primary/20' : 'bg-warning/20',
            )}
          >
            {state === 'open' ? (
              <CheckCircle className="w-6 h-6 text-primary" />
            ) : (
              <AlertCircle className="w-6 h-6 text-warning" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground">{statusLabel}</h3>
            <p className="text-sm text-muted-foreground">
              {state === 'open'
                ? `${settings?.profileName ? settings.profileName + ' · ' : ''}${settings?.connectedNumber ?? 'Número conectado'}`
                : settings?.instanceName
                  ? `Instância: ${settings.instanceName}`
                  : 'Nenhuma instância criada ainda'}
            </p>
          </div>
          <Badge variant={state === 'open' ? 'default' : 'secondary'}>{statusLabel}</Badge>
        </div>

        {/* Credenciais */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-10 h-10 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
              <Key className="w-5 h-5 text-[#25D366]" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">Credenciais da Evolution API</h3>
              <a
                href="https://doc.evolution-api.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                Documentação <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Servidor</Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://sua-instancia.evolution-api.com"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>API Key Global</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.hasCredentials ? '••••••••••••' : 'Sua API Key global'}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A chave fica guardada com segurança no servidor e nunca é exibida novamente.
              </p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar credenciais
          </Button>
        </div>

        {/* Conexão */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <QrCode className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-medium text-foreground">Conexão do número</h3>
          </div>

          {!settings?.hasCredentials && (
            <p className="text-sm text-muted-foreground">
              Salve as credenciais acima para liberar a conexão do número.
            </p>
          )}

          {settings?.hasCredentials && state !== 'open' && (
            <>
              {qrCode ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <img
                    src={qrCode}
                    alt="QR Code para conectar o WhatsApp"
                    className="w-64 h-64 rounded-lg bg-white p-3"
                  />
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Abra o WhatsApp no celular, vá em <strong>Aparelhos conectados</strong> e escaneie o código.
                  </p>
                  {pairingCode && (
                    <p className="text-sm text-foreground">
                      Ou use o código: <span className="font-mono font-semibold">{pairingCode}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Aguardando leitura...
                  </div>
                </div>
              ) : (
                <>
                  {qrExpired && (
                    <p className="text-sm text-warning">
                      O QR Code expirou. Gere um novo código para tentar novamente.
                    </p>
                  )}
                  <Button onClick={handleConnect} disabled={connecting} className="w-full">
                    {connecting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <QrCode className="w-4 h-4 mr-2" />
                    )}
                    {settings?.instanceName ? 'Gerar novo QR Code' : 'Conectar WhatsApp'}
                  </Button>
                </>
              )}
              {qrCode && (
                <Button variant="outline" onClick={handleConnect} disabled={connecting} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Gerar novo QR Code
                </Button>
              )}
            </>
          )}

          {state === 'open' && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={handleLogout} disabled={working} className="flex-1">
                <LogOut className="w-4 h-4 mr-2" />
                Desconectar número
              </Button>
              <Button variant="destructive" onClick={handleRemove} disabled={working} className="flex-1">
                <Trash2 className="w-4 h-4 mr-2" />
                Remover integração
              </Button>
            </div>
          )}

          {state !== 'open' && settings?.instanceName && (
            <Button variant="ghost" onClick={handleRemove} disabled={working} className="w-full text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Remover integração
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
