import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, QrCode, CheckCircle, Shield, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CardPaymentForm } from "@/components/checkout/CardPaymentForm";
import { PixPaymentForm } from "@/components/checkout/PixPaymentForm";

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
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card");
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

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

  const createPaymentIntent = async (method: "card" | "pix") => {
    if (!subscription) return;

    setCreatingIntent(true);
    setClientSecret(null);

    try {
      const { data, error } = await supabase.functions.invoke("create-payment-intent", {
        body: {
          subscriptionId: subscription.id,
          paymentMethod: method,
        },
      });

      if (error) throw error;

      if (data.publishableKey) {
        setStripePromise(loadStripe(data.publishableKey));
      }

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      }
    } catch (error: any) {
      console.error("Payment intent error:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível iniciar o pagamento",
        variant: "destructive",
      });
    } finally {
      setCreatingIntent(false);
    }
  };

  useEffect(() => {
    if (subscription && !clientSecret) {
      createPaymentIntent(paymentMethod);
    }
  }, [subscription]);

  const handleTabChange = (value: string) => {
    const method = value as "card" | "pix";
    setPaymentMethod(method);
    createPaymentIntent(method);
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
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

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Pagamento confirmado!</h2>
            <p className="text-muted-foreground mb-4">
              Seu pagamento foi processado com sucesso. Seu ativo será desbloqueado automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = subscription.asset.checkout_primary_color || "#10B981";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Top Banner */}
      <div 
        className="w-full py-3 text-center text-sm font-medium text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <AlertTriangle className="inline-block h-4 w-4 mr-2" />
        ATENÇÃO! APÓS O PAGAMENTO, SEU ATIVO SERÁ DESBLOQUEADO AUTOMATICAMENTE.
      </div>

      <div className="container max-w-6xl mx-auto p-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Payment Form */}
          <div className="lg:col-span-2 space-y-6">
            {subscription.asset.checkout_logo_url && (
              <div className="flex justify-center lg:justify-start">
                <img 
                  src={subscription.asset.checkout_logo_url} 
                  alt="Logo" 
                  className="max-h-12 object-contain"
                />
              </div>
            )}

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    1
                  </div>
                  <CardTitle className="text-lg">Pagamento</CardTitle>
                </div>
                {subscription.asset.checkout_message && (
                  <p className="text-sm text-muted-foreground mt-2 ml-11">
                    {subscription.asset.checkout_message}
                  </p>
                )}
              </CardHeader>

              <CardContent>
                <Tabs value={paymentMethod} onValueChange={handleTabChange}>
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="card" className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Cartão
                    </TabsTrigger>
                    <TabsTrigger value="pix" className="flex items-center gap-2">
                      <QrCode className="h-4 w-4" />
                      Pix
                    </TabsTrigger>
                  </TabsList>

                  {creatingIntent ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : stripePromise && clientSecret ? (
                    <Elements 
                      stripe={stripePromise} 
                      options={{ 
                        clientSecret,
                        appearance: {
                          theme: "stripe",
                          variables: {
                            colorPrimary: primaryColor,
                          },
                        },
                        locale: "pt-BR",
                      }}
                    >
                      <TabsContent value="card" className="mt-0">
                        <CardPaymentForm 
                          amount={subscription.monthly_value}
                          primaryColor={primaryColor}
                          onSuccess={handlePaymentSuccess}
                        />
                      </TabsContent>
                      <TabsContent value="pix" className="mt-0">
                        <PixPaymentForm 
                          clientSecret={clientSecret}
                          amount={subscription.monthly_value}
                          primaryColor={primaryColor}
                          onSuccess={handlePaymentSuccess}
                        />
                      </TabsContent>
                    </Elements>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      Erro ao carregar formulário de pagamento. Tente novamente.
                    </div>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Order Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">RESUMO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <div className="border-t border-border pt-4">
                  <div className="flex justify-between items-baseline">
                    <span className="font-medium">Total</span>
                    <div className="text-right">
                      <span 
                        className="text-2xl font-bold"
                        style={{ color: primaryColor }}
                      >
                        R$ {subscription.monthly_value.toFixed(2).replace(".", ",")}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        em até 12x no cartão
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Pagamento 100% seguro</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
