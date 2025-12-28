import { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CardPaymentFormProps {
  amount: number;
  primaryColor: string;
  onSuccess: () => void;
}

export function CardPaymentForm({ amount, primaryColor, onSuccess }: CardPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

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
          title: "Erro no pagamento",
          description: error.message || "Ocorreu um erro ao processar o pagamento",
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        toast({
          title: "Pagamento confirmado!",
          description: "Seu pagamento foi processado com sucesso.",
        });
        onSuccess();
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-muted/30 rounded-lg p-4">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full h-12 text-base font-semibold"
        style={{ backgroundColor: primaryColor }}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            Pagar R$ {amount.toFixed(2).replace(".", ",")}
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>Pagamento seguro processado pelo Stripe</span>
      </div>
    </form>
  );
}
