import { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, getTranslations } from "@/lib/checkout-utils";

interface CardPaymentFormProps {
  amount: number;
  primaryColor: string;
  onSuccess: () => void;
  isDarkTheme?: boolean;
  country?: string;
}

export function CardPaymentForm({ amount, primaryColor, onSuccess, isDarkTheme = false, country = 'BR' }: CardPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const t = getTranslations(country);
  const formattedAmount = formatCurrency(amount, country);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success`,
        },
        redirect: "if_required",
      });

      if (error) {
        toast({
          title: country === 'BR' ? "Erro no pagamento" : "Payment error",
          description: error.message || (country === 'BR' ? "Ocorreu um erro ao processar o pagamento" : "An error occurred while processing the payment"),
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        toast({
          title: country === 'BR' ? "Pagamento confirmado!" : "Payment confirmed!",
          description: country === 'BR' ? "Seu pagamento foi processado com sucesso." : "Your payment was processed successfully.",
        });
        onSuccess();
      }
    } catch (err: any) {
      toast({
        title: country === 'BR' ? "Erro" : "Error",
        description: err.message || (country === 'BR' ? "Ocorreu um erro inesperado" : "An unexpected error occurred"),
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className={`rounded-xl p-5 border ${isDarkTheme 
        ? 'bg-slate-700/50 border-slate-600' 
        : 'bg-muted/30 border-border/50'}`}
      >
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full h-14 text-base font-semibold rounded-xl shadow-lg transition-all hover:shadow-xl"
        style={{ backgroundColor: primaryColor }}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            {t.processing}
          </>
        ) : (
          <>
            {t.payButton} {formattedAmount}
          </>
        )}
      </Button>
    </form>
  );
}
