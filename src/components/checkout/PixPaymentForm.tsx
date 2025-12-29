import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, CheckCircle, Clock, QrCode, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PixPaymentFormProps {
  subscriptionId: string;
  amount: number;
  primaryColor: string;
  customerData: {
    name: string;
    email: string;
    document: string;
  };
  onSuccess: () => void;
  isDarkTheme?: boolean;
  returnUrl?: string;
}

interface PixData {
  paymentId: string;
  dbPaymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expirationDate: string;
}

export function PixPaymentForm({
  subscriptionId,
  amount,
  primaryColor,
  customerData,
  onSuccess,
  isDarkTheme = false,
  returnUrl,
}: PixPaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const { toast } = useToast();

  const createPixPayment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-mercadopago-payment', {
        body: {
          subscriptionId,
          customerEmail: customerData.email,
          customerName: customerData.name,
          customerDocument: customerData.document,
          returnUrl,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setPixData(data);
      
      // Calculate time left until expiration
      if (data.expirationDate) {
        const expiration = new Date(data.expirationDate).getTime();
        const now = Date.now();
        setTimeLeft(Math.max(0, Math.floor((expiration - now) / 1000)));
      } else {
        // Default 30 minutes if no expiration provided
        setTimeLeft(30 * 60);
      }
    } catch (error: unknown) {
      console.error('Error creating Pix payment:', error);
      const message = error instanceof Error ? error.message : 'Erro ao gerar Pix';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!pixData?.qrCode) return;
    
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopied(true);
      toast({
        title: 'Código copiado!',
        description: 'Cole no seu app de banco para pagar',
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível copiar o código',
        variant: 'destructive',
      });
    }
  };

  const checkPaymentStatus = useCallback(async () => {
    if (!pixData?.paymentId) return;
    
    setCheckingStatus(true);
    try {
      // Check if subscription status changed to active
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('id', subscriptionId)
        .single();

      if (error) throw error;

      if (data.status === 'active') {
        toast({
          title: 'Pagamento confirmado!',
          description: 'Seu pagamento foi aprovado',
        });
        onSuccess();
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    } finally {
      setCheckingStatus(false);
    }
  }, [pixData?.paymentId, subscriptionId, onSuccess, toast]);

  // Auto-check payment status every 5 seconds
  useEffect(() => {
    if (!pixData) return;

    const interval = setInterval(() => {
      checkPaymentStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [pixData, checkPaymentStatus]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (!pixData) {
    return (
      <div className="space-y-6 py-4">
        <div className={`text-center p-6 rounded-xl ${isDarkTheme ? 'bg-slate-700/50' : 'bg-muted/30'}`}>
          <QrCode className="w-16 h-16 mx-auto mb-4" style={{ color: primaryColor }} />
          <h3 className={`text-lg font-semibold mb-2 ${isDarkTheme ? 'text-white' : ''}`}>
            Pagar com Pix
          </h3>
          <p className={`text-sm mb-4 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
            Valor: <span className="font-semibold">{formatCurrency(amount)}</span>
          </p>
          <p className={`text-xs ${isDarkTheme ? 'text-slate-500' : 'text-muted-foreground'}`}>
            Clique abaixo para gerar o código Pix
          </p>
        </div>

        <Button
          onClick={createPixPayment}
          disabled={loading}
          className="w-full h-14 text-lg font-semibold"
          style={{ backgroundColor: primaryColor }}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Gerando Pix...
            </>
          ) : (
            <>
              <QrCode className="w-5 h-5 mr-2" />
              Gerar Código Pix
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Timer */}
      {timeLeft !== null && timeLeft > 0 && (
        <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${isDarkTheme ? 'bg-slate-700/50' : 'bg-muted/30'}`}>
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className={`text-sm ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
            Expira em: <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
          </span>
        </div>
      )}

      {/* QR Code */}
      <div className="flex justify-center">
        <div className={`p-4 rounded-xl ${isDarkTheme ? 'bg-white' : 'bg-white'}`}>
          {pixData.qrCodeBase64 ? (
            <img
              src={`data:image/png;base64,${pixData.qrCodeBase64}`}
              alt="QR Code Pix"
              className="w-48 h-48"
            />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center">
              <QrCode className="w-24 h-24 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-center">
        <p className={`text-sm ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>Valor</p>
        <p className="text-2xl font-bold" style={{ color: primaryColor }}>
          {formatCurrency(amount)}
        </p>
      </div>

      {/* Copy Button */}
      <div className="space-y-3">
        <p className={`text-sm text-center ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
          Ou copie o código Pix Copia e Cola:
        </p>
        <Button
          onClick={copyToClipboard}
          variant="outline"
          className={`w-full h-12 ${isDarkTheme ? 'border-slate-600' : ''}`}
        >
          {copied ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
              Código copiado!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copiar código Pix
            </>
          )}
        </Button>
      </div>

      {/* Check Status Button */}
      <Button
        onClick={checkPaymentStatus}
        variant="ghost"
        disabled={checkingStatus}
        className={`w-full ${isDarkTheme ? 'text-slate-400 hover:text-white' : ''}`}
      >
        {checkingStatus ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <RefreshCw className="w-4 h-4 mr-2" />
        )}
        Já paguei, verificar pagamento
      </Button>

      {/* Instructions */}
      <div className={`text-xs text-center space-y-1 ${isDarkTheme ? 'text-slate-500' : 'text-muted-foreground'}`}>
        <p>1. Abra o app do seu banco</p>
        <p>2. Escaneie o QR Code ou cole o código Pix</p>
        <p>3. Confirme o pagamento</p>
        <p className="pt-2">O pagamento é confirmado automaticamente em alguns segundos.</p>
      </div>
    </div>
  );
}
