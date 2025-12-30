import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/checkout-utils";

interface MercadoPagoCardFormProps {
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

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export function MercadoPagoCardForm({
  subscriptionId,
  amount,
  primaryColor,
  customerData,
  onSuccess,
  isDarkTheme = false,
  country = "BR"
}: MercadoPagoCardFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sdkLoading, setSdkLoading] = useState(true);
  const [mpInstance, setMpInstance] = useState<any>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [cardFormInstance, setCardFormInstance] = useState<any>(null);

  // Form state (only for display, not for sending raw data)
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState(customerData.name);
  const [expirationDate, setExpirationDate] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [installments, setInstallments] = useState(1);
  const [identificationNumber, setIdentificationNumber] = useState(customerData.document);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [issuerId, setIssuerId] = useState<string | null>(null);

  // Fetch Mercado Pago public key
  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        // We need to fetch the public key from a secure endpoint
        const { data, error } = await supabase.functions.invoke("get-mercadopago-public-key");
        
        if (error) throw error;
        
        if (data?.publicKey) {
          setPublicKey(data.publicKey);
        } else {
          console.error("No public key returned");
          setSdkLoading(false);
        }
      } catch (error) {
        console.error("Error fetching MP public key:", error);
        setSdkLoading(false);
      }
    };

    fetchPublicKey();
  }, []);

  // Load Mercado Pago SDK
  useEffect(() => {
    if (!publicKey) return;

    const loadSDK = async () => {
      // Check if SDK is already loaded
      if (window.MercadoPago) {
        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        setMpInstance(mp);
        setSdkLoading(false);
        return;
      }

      // Load SDK script
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = () => {
        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        setMpInstance(mp);
        setSdkLoading(false);
      };
      script.onerror = () => {
        console.error("Failed to load Mercado Pago SDK");
        setSdkLoading(false);
      };
      document.head.appendChild(script);
    };

    loadSDK();
  }, [publicKey]);

  // Get payment method info when card number changes
  const getPaymentMethod = useCallback(async (bin: string) => {
    if (!mpInstance || bin.length < 6) return;

    try {
      const response = await mpInstance.getPaymentMethods({ bin });
      if (response.results && response.results.length > 0) {
        const pm = response.results[0];
        setPaymentMethodId(pm.id);
        setIssuerId(pm.issuer?.id || null);
      }
    } catch (error) {
      console.error("Error getting payment method:", error);
    }
  }, [mpInstance]);

  // Handle card number change
  const handleCardNumberChange = (value: string) => {
    const cleanValue = value.replace(/\s/g, "").replace(/\D/g, "");
    const formatted = cleanValue.replace(/(\d{4})/g, "$1 ").trim();
    setCardNumber(formatted);

    // Get payment method when we have at least 6 digits
    if (cleanValue.length >= 6) {
      getPaymentMethod(cleanValue.substring(0, 6));
    }
  };

  // Handle expiration date change
  const handleExpirationChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    if (cleanValue.length <= 2) {
      setExpirationDate(cleanValue);
    } else {
      setExpirationDate(`${cleanValue.substring(0, 2)}/${cleanValue.substring(2, 4)}`);
    }
  };

  // Create card token using SDK (PCI-DSS compliant)
  const createCardToken = async (): Promise<string | null> => {
    if (!mpInstance) {
      toast({
        title: "Erro",
        description: "SDK do Mercado Pago não carregado",
        variant: "destructive",
      });
      return null;
    }

    try {
      const [month, year] = expirationDate.split("/");
      const cardData = {
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardholderName,
        cardExpirationMonth: month,
        cardExpirationYear: `20${year}`,
        securityCode: securityCode,
        identificationType: "CPF",
        identificationNumber: identificationNumber.replace(/\D/g, ""),
      };

      const response = await mpInstance.createCardToken(cardData);
      
      if (response.id) {
        return response.id;
      } else {
        throw new Error("Token não gerado");
      }
    } catch (error: any) {
      console.error("Error creating card token:", error);
      
      let errorMessage = "Não foi possível processar os dados do cartão";
      if (error.message) {
        if (error.message.includes("cardNumber")) {
          errorMessage = "Número do cartão inválido";
        } else if (error.message.includes("securityCode")) {
          errorMessage = "Código de segurança inválido";
        } else if (error.message.includes("cardExpiration")) {
          errorMessage = "Data de validade inválida";
        }
      }
      
      toast({
        title: "Erro nos dados do cartão",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create token using SDK (card data never leaves the browser unencrypted)
      const cardToken = await createCardToken();
      
      if (!cardToken) {
        setLoading(false);
        return;
      }

      // Send only the token to the backend, never raw card data
      const { data, error } = await supabase.functions.invoke("create-mercadopago-payment", {
        body: {
          subscriptionId,
          customerEmail: customerData.email,
          customerName: customerData.name,
          customerDocument: identificationNumber,
          paymentMethod: "card",
          cardToken,
          paymentMethodId,
          issuerId,
          installments,
        },
      });

      if (error) throw error;

      if (data.status === "approved") {
        toast({
          title: "Pagamento aprovado!",
          description: "Seu pagamento foi processado com sucesso.",
        });
        onSuccess();
      } else if (data.status === "in_process" || data.status === "pending") {
        toast({
          title: "Pagamento em processamento",
          description: "Seu pagamento está sendo analisado.",
        });
        onSuccess();
      } else {
        toast({
          title: "Pagamento não aprovado",
          description: data.statusDetail || "Tente novamente ou use outro cartão.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Erro no pagamento",
        description: error.message || "Não foi possível processar o pagamento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formattedAmount = formatCurrency(amount, country);

  if (sdkLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Carregando formulário seguro...</span>
      </div>
    );
  }

  if (!publicKey || !mpInstance) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          Pagamento com cartão indisponível no momento.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Por favor, tente outro método de pagamento.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className={isDarkTheme ? "text-slate-300" : ""}>
          Número do Cartão
        </Label>
        <div className="relative">
          <CreditCard className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${isDarkTheme ? "text-slate-400" : "text-muted-foreground"}`} />
          <Input
            type="text"
            value={cardNumber}
            onChange={(e) => handleCardNumberChange(e.target.value)}
            placeholder="0000 0000 0000 0000"
            maxLength={19}
            className={`pl-10 ${isDarkTheme ? "bg-slate-700 border-slate-600 text-white" : ""}`}
            autoComplete="cc-number"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className={isDarkTheme ? "text-slate-300" : ""}>
          Nome no Cartão
        </Label>
        <Input
          type="text"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
          placeholder="NOME COMO NO CARTÃO"
          className={isDarkTheme ? "bg-slate-700 border-slate-600 text-white" : ""}
          autoComplete="cc-name"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className={isDarkTheme ? "text-slate-300" : ""}>Validade</Label>
          <Input
            type="text"
            value={expirationDate}
            onChange={(e) => handleExpirationChange(e.target.value)}
            placeholder="MM/AA"
            maxLength={5}
            className={isDarkTheme ? "bg-slate-700 border-slate-600 text-white" : ""}
            autoComplete="cc-exp"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className={isDarkTheme ? "text-slate-300" : ""}>CVV</Label>
          <Input
            type="text"
            value={securityCode}
            onChange={(e) => setSecurityCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="123"
            maxLength={4}
            className={isDarkTheme ? "bg-slate-700 border-slate-600 text-white" : ""}
            autoComplete="cc-csc"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className={isDarkTheme ? "text-slate-300" : ""}>CPF do Titular</Label>
        <Input
          type="text"
          value={identificationNumber}
          onChange={(e) => setIdentificationNumber(e.target.value)}
          placeholder="000.000.000-00"
          className={isDarkTheme ? "bg-slate-700 border-slate-600 text-white" : ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label className={isDarkTheme ? "text-slate-300" : ""}>Parcelas</Label>
        <select
          value={installments}
          onChange={(e) => setInstallments(Number(e.target.value))}
          className={`w-full h-10 px-3 py-2 rounded-md border ${
            isDarkTheme 
              ? "bg-slate-700 border-slate-600 text-white" 
              : "bg-background border-input"
          }`}
        >
          <option value={1}>1x de {formattedAmount} (sem juros)</option>
          {amount >= 100 && <option value={2}>2x de {formatCurrency(amount / 2, country)} (sem juros)</option>}
          {amount >= 150 && <option value={3}>3x de {formatCurrency(amount / 3, country)} (sem juros)</option>}
          {amount >= 200 && <option value={4}>4x de {formatCurrency(amount / 4, country)} (sem juros)</option>}
          {amount >= 300 && <option value={6}>6x de {formatCurrency(amount / 6, country)} (sem juros)</option>}
          {amount >= 600 && <option value={12}>12x de {formatCurrency(amount / 12, country)} (sem juros)</option>}
        </select>
      </div>

      <Button
        type="submit"
        disabled={loading || !mpInstance}
        className="w-full h-14 text-lg font-semibold text-white shadow-lg transition-all hover:scale-[1.02]"
        style={{ backgroundColor: primaryColor }}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Lock className="mr-2 h-5 w-5" />
            Pagar {formattedAmount}
          </>
        )}
      </Button>

      <p className={`text-xs text-center ${isDarkTheme ? "text-slate-500" : "text-muted-foreground"}`}>
        🔒 Pagamento seguro - Dados tokenizados pelo Mercado Pago
      </p>
    </form>
  );
}
