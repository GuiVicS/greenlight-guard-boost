import { useState } from "react";
import { useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Copy, CheckCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BoletoPaymentFormProps {
  clientSecret: string;
  amount: number;
  primaryColor: string;
  customerData: {
    name: string;
    email: string;
    cpf: string;
  };
  onSuccess: () => void;
  isDarkTheme?: boolean;
}

export function BoletoPaymentForm({ 
  clientSecret, 
  amount, 
  primaryColor, 
  customerData,
  onSuccess,
  isDarkTheme = false
}: BoletoPaymentFormProps) {
  const stripe = useStripe();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [boletoData, setBoletoData] = useState<{
    hostedVoucherUrl: string;
    number: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const generateBoleto = async () => {
    if (!stripe || !customerData.name || !customerData.email || !customerData.cpf) {
      toast({
        title: "Dados incompletos",
        description: "Preencha todos os campos de identificação",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await (stripe as any).confirmBoletoPayment(clientSecret, {
        payment_method: {
          billing_details: {
            name: customerData.name,
            email: customerData.email,
            address: {
              line1: "N/A",
              city: "São Paulo",
              state: "SP",
              postal_code: "01310100",
              country: "BR",
            },
          },
          boleto: {
            tax_id: customerData.cpf.replace(/\D/g, ""),
          },
        },
      });

      if (error) {
        toast({
          title: "Erro ao gerar boleto",
          description: error.message || "Não foi possível gerar o boleto",
          variant: "destructive",
        });
        return;
      }

      const nextAction = paymentIntent?.next_action as any;
      if (nextAction?.boleto_display_details) {
        const boletoInfo = nextAction.boleto_display_details;
        setBoletoData({
          hostedVoucherUrl: boletoInfo.hosted_voucher_url || "",
          number: boletoInfo.number || "",
          expiresAt: boletoInfo.expires_at 
            ? new Date(boletoInfo.expires_at * 1000).toLocaleDateString("pt-BR")
            : "",
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
    if (!boletoData?.number) return;

    try {
      await navigator.clipboard.writeText(boletoData.number);
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

  if (!boletoData) {
    return (
      <div className="space-y-6">
        <div className={`rounded-xl p-6 text-center border ${isDarkTheme 
          ? 'bg-slate-700/50 border-slate-600' 
          : 'bg-muted/30 border-border/50'}`}
        >
          <FileText className={`h-16 w-16 mx-auto mb-4 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`} />
          <p className={`text-sm mb-2 ${isDarkTheme ? 'text-slate-300' : 'text-muted-foreground'}`}>
            Clique no botão abaixo para gerar o boleto bancário
          </p>
          <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
            O boleto terá vencimento de 3 dias úteis
          </p>
        </div>

        <Button
          onClick={generateBoleto}
          disabled={!stripe || isProcessing || !customerData.name || !customerData.email || !customerData.cpf}
          className="w-full h-14 text-base font-semibold rounded-xl shadow-lg transition-all hover:shadow-xl"
          style={{ backgroundColor: primaryColor }}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Gerando Boleto...
            </>
          ) : (
            <>
              <FileText className="h-5 w-5 mr-2" />
              Gerar Boleto - R$ {amount.toFixed(2).replace(".", ",")}
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-xl p-6 text-center border ${isDarkTheme 
        ? 'bg-gradient-to-br from-green-950/30 to-emerald-950/30 border-green-800' 
        : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'}`}
      >
        <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
        <h3 className={`font-semibold text-lg mb-1 ${isDarkTheme ? 'text-white' : ''}`}>Boleto Gerado!</h3>
        <p className={`text-sm mb-4 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
          Vencimento: {boletoData.expiresAt}
        </p>

        {boletoData.number && (
          <div className={`rounded-lg p-4 border mb-4 ${isDarkTheme 
            ? 'bg-slate-800 border-slate-600' 
            : 'bg-background border-border'}`}
          >
            <p className={`text-xs mb-2 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>Linha digitável</p>
            <p className={`text-sm font-mono break-all ${isDarkTheme ? 'text-white' : 'text-foreground'}`}>
              {boletoData.number}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleCopy}
            variant="outline"
            className="flex-1"
          >
            {copied ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copiar código
              </>
            )}
          </Button>

          {boletoData.hostedVoucherUrl && (
            <Button
              onClick={() => window.open(boletoData.hostedVoucherUrl, "_blank")}
              className="flex-1"
              style={{ backgroundColor: primaryColor }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visualizar Boleto
            </Button>
          )}
        </div>
      </div>

      <p className={`text-xs text-center ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
        Após o pagamento, a confirmação pode levar até 3 dias úteis. Seu ativo será desbloqueado automaticamente.
      </p>
    </div>
  );
}
