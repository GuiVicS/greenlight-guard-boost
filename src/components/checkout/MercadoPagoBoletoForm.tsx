import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/checkout-utils";

interface MercadoPagoBoletoFormProps {
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
  country?: string;
}

export function MercadoPagoBoletoForm({
  subscriptionId,
  amount,
  primaryColor,
  customerData,
  onSuccess,
  isDarkTheme = false,
  country = "BR"
}: MercadoPagoBoletoFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [boletoData, setBoletoData] = useState<{
    boletoUrl: string;
    barcode: string;
    expirationDate: string;
  } | null>(null);

  const handleGenerateBoleto = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-mercadopago-payment", {
        body: {
          subscriptionId,
          customerEmail: customerData.email,
          customerName: customerData.name,
          customerDocument: customerData.document,
          paymentMethod: "boleto",
        },
      });

      if (error) {
        // Extract error message from the response
        let errorMsg = "Não foi possível gerar o boleto";
        if (error.message) {
          if (error.message.includes("Invalid transaction_amount") || error.message.includes("4037")) {
            errorMsg = "Valor mínimo para boleto é R$ 5,00";
          } else {
            errorMsg = error.message;
          }
        }
        throw new Error(errorMsg);
      }

      if (data?.error) {
        let errorMsg = data.error;
        if (data.error.includes("Invalid transaction_amount") || data.error.includes("4037")) {
          errorMsg = "Valor mínimo para boleto é R$ 5,00";
        }
        throw new Error(errorMsg);
      }

      if (data.boletoUrl) {
        setBoletoData({
          boletoUrl: data.boletoUrl,
          barcode: data.barcode || "",
          expirationDate: data.expirationDate || "",
        });

        toast({
          title: "Boleto gerado!",
          description: "Copie o código de barras ou clique para visualizar.",
        });
      } else {
        throw new Error("Não foi possível gerar o boleto");
      }
    } catch (error: any) {
      console.error("Boleto error:", error);
      toast({
        title: "Erro ao gerar boleto",
        description: error.message || "Não foi possível gerar o boleto",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyBarcode = () => {
    if (boletoData?.barcode) {
      navigator.clipboard.writeText(boletoData.barcode);
      toast({
        title: "Código copiado!",
        description: "O código de barras foi copiado para a área de transferência.",
      });
    }
  };

  const formattedAmount = formatCurrency(amount, country);

  if (boletoData) {
    return (
      <div className="space-y-6">
        <div className={`text-center p-6 rounded-xl ${isDarkTheme ? "bg-slate-700/50" : "bg-slate-50"}`}>
          <FileText className="h-16 w-16 mx-auto mb-4" style={{ color: primaryColor }} />
          <h3 className={`text-xl font-bold mb-2 ${isDarkTheme ? "text-white" : ""}`}>
            Boleto Gerado!
          </h3>
          <p className={`text-2xl font-bold mb-4 ${isDarkTheme ? "text-white" : ""}`}>
            {formattedAmount}
          </p>
          {boletoData.expirationDate && (
            <p className={`text-sm ${isDarkTheme ? "text-slate-400" : "text-muted-foreground"}`}>
              Vencimento: {new Date(boletoData.expirationDate).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>

        {boletoData.barcode && (
          <div className="space-y-2">
            <p className={`text-sm font-medium ${isDarkTheme ? "text-slate-300" : ""}`}>
              Código de Barras:
            </p>
            <div className={`p-3 rounded-lg font-mono text-xs break-all ${
              isDarkTheme ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-700"
            }`}>
              {boletoData.barcode}
            </div>
            <Button
              variant="outline"
              onClick={copyBarcode}
              className={`w-full ${isDarkTheme ? "border-slate-600 text-slate-300" : ""}`}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar Código
            </Button>
          </div>
        )}

        <Button
          onClick={() => window.open(boletoData.boletoUrl, "_blank")}
          className="w-full h-14 text-lg font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <ExternalLink className="mr-2 h-5 w-5" />
          Visualizar Boleto
        </Button>

        <Button
          variant="outline"
          onClick={onSuccess}
          className={`w-full ${isDarkTheme ? "border-slate-600 text-slate-300" : ""}`}
        >
          Já paguei o boleto
        </Button>

        <p className={`text-xs text-center ${isDarkTheme ? "text-slate-500" : "text-muted-foreground"}`}>
          O boleto pode levar até 3 dias úteis para ser compensado. Após o pagamento, seu acesso será liberado automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`text-center p-6 rounded-xl ${isDarkTheme ? "bg-slate-700/50" : "bg-slate-50"}`}>
        <FileText className="h-16 w-16 mx-auto mb-4" style={{ color: primaryColor }} />
        <h3 className={`text-xl font-bold mb-2 ${isDarkTheme ? "text-white" : ""}`}>
          Pagamento via Boleto
        </h3>
        <p className={`${isDarkTheme ? "text-slate-400" : "text-muted-foreground"}`}>
          Gere um boleto bancário para pagar
        </p>
        <p className={`text-2xl font-bold mt-4 ${isDarkTheme ? "text-white" : ""}`}>
          {formattedAmount}
        </p>
      </div>

      <Button
        onClick={handleGenerateBoleto}
        disabled={loading}
        className="w-full h-14 text-lg font-semibold text-white shadow-lg transition-all hover:scale-[1.02]"
        style={{ backgroundColor: primaryColor }}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Gerando boleto...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-5 w-5" />
            Gerar Boleto
          </>
        )}
      </Button>

      <p className={`text-xs text-center ${isDarkTheme ? "text-slate-500" : "text-muted-foreground"}`}>
        🔒 Pagamento 100% seguro
      </p>
    </div>
  );
}