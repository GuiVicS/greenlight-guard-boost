import { useState, useEffect } from "react";
import { useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, CheckCircle, Clock, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PixPaymentFormProps {
  clientSecret: string;
  amount: number;
  primaryColor: string;
  onSuccess: () => void;
}

export function PixPaymentForm({ clientSecret, amount, primaryColor, onSuccess }: PixPaymentFormProps) {
  const stripe = useStripe();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    copyPaste: string;
    expiresAt: Date;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const generatePix = async () => {
    if (!stripe) return;

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPixPayment(clientSecret, {
        payment_method: {},
      });

      if (error) {
        toast({
          title: "Erro ao gerar Pix",
          description: error.message || "Não foi possível gerar o código Pix",
          variant: "destructive",
        });
        return;
      }

      const nextAction = paymentIntent?.next_action as any;
      if (nextAction?.pix_display_qr_code) {
        const pixInfo = nextAction.pix_display_qr_code;
        setPixData({
          qrCode: pixInfo.image_url_png || "",
          copyPaste: pixInfo.data || "",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!pixData?.copyPaste) return;

    try {
      await navigator.clipboard.writeText(pixData.copyPaste);
      setCopied(true);
      toast({
        title: "Código copiado!",
        description: "Cole no app do seu banco para pagar",
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível copiar o código",
        variant: "destructive",
      });
    }
  };

  // Poll for payment status
  useEffect(() => {
    if (!pixData || !stripe || !clientSecret) return;

    const checkPaymentStatus = async () => {
      try {
        const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
        if (paymentIntent?.status === "succeeded") {
          toast({
            title: "Pagamento confirmado!",
            description: "Seu pagamento via Pix foi processado.",
          });
          onSuccess();
        }
      } catch (err) {
        console.error("Error checking payment status:", err);
      }
    };

    const interval = setInterval(checkPaymentStatus, 5000);
    return () => clearInterval(interval);
  }, [pixData, stripe, clientSecret, onSuccess, toast]);

  if (!pixData) {
    return (
      <div className="space-y-6">
        <div className="bg-muted/30 rounded-lg p-6 text-center">
          <QrCode className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">
            Clique no botão abaixo para gerar o QR Code Pix
          </p>
        </div>

        <Button
          onClick={generatePix}
          disabled={!stripe || isProcessing}
          className="w-full h-12 text-base font-semibold"
          style={{ backgroundColor: primaryColor }}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Gerando Pix...
            </>
          ) : (
            <>
              Gerar Pix - R$ {amount.toFixed(2).replace(".", ",")}
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/30 rounded-lg p-6 text-center">
        {pixData.qrCode && (
          <div className="mb-4">
            <img 
              src={pixData.qrCode} 
              alt="QR Code Pix" 
              className="mx-auto w-48 h-48 rounded-lg border border-border"
            />
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-4">
          Escaneie o QR Code ou copie o código abaixo
        </p>

        <div className="bg-background rounded-lg p-3 border border-border mb-4">
          <p className="text-xs font-mono break-all text-foreground/80 line-clamp-2">
            {pixData.copyPaste}
          </p>
        </div>

        <Button
          onClick={handleCopy}
          variant="outline"
          className="w-full"
        >
          {copied ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              Código copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar código Pix
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
        <Clock className="h-4 w-4" />
        <span>Aguardando confirmação do pagamento...</span>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>

      <p className="text-xs text-center text-muted-foreground">
        O código Pix expira em 24 horas. Após o pagamento, a confirmação é automática.
      </p>
    </div>
  );
}
