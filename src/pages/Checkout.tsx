import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, QrCode, Shield, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionData {
  id: string;
  plan_name: string;
  monthly_value: number;
  asset: {
    id: string;
    name: string;
    checkout_logo_url: string | null;
    checkout_message: string | null;
    checkout_primary_color: string | null;
    client: {
      name: string;
      email: string;
    };
  };
}

export default function Checkout() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card");

  useEffect(() => {
    fetchSubscription();
  }, [assetId]);

  const fetchSubscription = async () => {
    if (!assetId) return;

    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id,
          plan_name,
          monthly_value,
          asset:assets!inner (
            id,
            name,
            checkout_logo_url,
            checkout_message,
            checkout_primary_color,
            client:clients (
              name,
              email
            )
          )
        `)
        .eq("asset_id", assetId)
        .eq("status", "overdue")
        .single();

      if (error) throw error;
      
      // Type assertion to handle the nested structure
      const subscriptionData = data as unknown as SubscriptionData;
      setSubscription(subscriptionData);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do pagamento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!subscription) return;

    setProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          subscriptionId: subscription.id,
          paymentMethod,
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}/checkout/${assetId}`,
        },
      });

      if (error) throw error;

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Erro no pagamento",
        description: error.message || "Não foi possível iniciar o pagamento",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Nenhuma pendência encontrada</h2>
            <p className="text-muted-foreground">
              Este ativo não possui pagamentos pendentes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = subscription.asset.checkout_primary_color || "hsl(var(--primary))";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {subscription.asset.checkout_logo_url && (
          <div className="flex justify-center mb-6">
            <img 
              src={subscription.asset.checkout_logo_url} 
              alt="Logo" 
              className="max-h-16 object-contain"
            />
          </div>
        )}

        <Card className="shadow-xl border-border/50">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Regularizar Pagamento</CardTitle>
            {subscription.asset.checkout_message && (
              <p className="text-muted-foreground mt-2">
                {subscription.asset.checkout_message}
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Order Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ativo</span>
                <span className="font-medium">{subscription.asset.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-medium">{subscription.plan_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{subscription.asset.client.name}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold" style={{ color: primaryColor }}>
                  R$ {subscription.monthly_value.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Forma de pagamento</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as "card" | "pix")}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="card"
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    paymentMethod === "card" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value="card" id="card" className="sr-only" />
                  <CreditCard className="h-5 w-5" style={{ color: paymentMethod === "card" ? primaryColor : undefined }} />
                  <div>
                    <p className="font-medium">Cartão</p>
                    <p className="text-xs text-muted-foreground">Crédito ou débito</p>
                  </div>
                </Label>

                <Label
                  htmlFor="pix"
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    paymentMethod === "pix" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value="pix" id="pix" className="sr-only" />
                  <QrCode className="h-5 w-5" style={{ color: paymentMethod === "pix" ? primaryColor : undefined }} />
                  <div>
                    <p className="font-medium">Pix</p>
                    <p className="text-xs text-muted-foreground">Pagamento instantâneo</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* Pay Button */}
            <Button
              onClick={handlePayment}
              disabled={processing}
              className="w-full h-12 text-base font-semibold"
              style={{ backgroundColor: primaryColor }}
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  Pagar R$ {subscription.monthly_value.toFixed(2).replace(".", ",")}
                </>
              )}
            </Button>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Pagamento seguro processado pelo Stripe</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Ao realizar o pagamento, seu site será desbloqueado automaticamente.
        </p>
      </div>
    </div>
  );
}
