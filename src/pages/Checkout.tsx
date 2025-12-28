import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, FileText, CheckCircle, Shield, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CardPaymentForm } from "@/components/checkout/CardPaymentForm";
import { BoletoPaymentForm } from "@/components/checkout/BoletoPaymentForm";
import { CustomerForm } from "@/components/checkout/CustomerForm";

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
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "boleto">("card");
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    cpf: "",
  });

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
      
      // Pre-fill customer email if available
      if (subscriptionData.asset.client.email) {
        setCustomerData(prev => ({ ...prev, email: subscriptionData.asset.client.email }));
      }
      if (subscriptionData.asset.client.name) {
        setCustomerData(prev => ({ ...prev, name: subscriptionData.asset.client.name }));
      }
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

  const createPaymentIntent = async (method: "card" | "boleto") => {
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
    const method = value as "card" | "boleto";
    setPaymentMethod(method);
    createPaymentIntent(method);
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Tudo certo!</h2>
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Pagamento confirmado!</h2>
            <p className="text-muted-foreground mb-6">
              Seu pagamento foi processado com sucesso. Seu ativo será desbloqueado automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = subscription.asset.checkout_primary_color || "#10B981";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Top Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-border/50 py-4 px-4 shadow-sm">
        <div className="container max-w-6xl mx-auto flex items-center justify-between">
          {subscription.asset.checkout_logo_url ? (
            <img 
              src={subscription.asset.checkout_logo_url} 
              alt="Logo" 
              className="max-h-10 object-contain"
            />
          ) : (
            <div className="font-bold text-xl">{subscription.asset.name}</div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">PAGAMENTO 100% SEGURO</span>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      <div 
        className="w-full py-3 text-center text-sm font-medium text-white shadow-md"
        style={{ backgroundColor: primaryColor }}
      >
        ATENÇÃO! APÓS A COMPRA, SEU ATIVO SERÁ DESBLOQUEADO AUTOMATICAMENTE.
      </div>

      <div className="container max-w-6xl mx-auto p-4 py-8">
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-3 space-y-6">
            {/* Identification Section */}
            <Card className="shadow-lg border-0 overflow-hidden">
              <CardHeader className="pb-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-md"
                    style={{ backgroundColor: primaryColor }}
                  >
                    1
                  </div>
                  <div>
                    <CardTitle className="text-xl">Identificação</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Utilizaremos seu e-mail para identificar seu perfil e enviar o comprovante.
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <CustomerForm 
                  customerData={customerData}
                  onChange={setCustomerData}
                  primaryColor={primaryColor}
                />
              </CardContent>
            </Card>

            {/* Payment Section */}
            <Card className="shadow-lg border-0 overflow-hidden">
              <CardHeader className="pb-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-md"
                    style={{ backgroundColor: primaryColor }}
                  >
                    2
                  </div>
                  <div>
                    <CardTitle className="text-xl">Pagamento</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Escolha a forma de pagamento para continuar.
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <Tabs value={paymentMethod} onValueChange={handleTabChange}>
                  <TabsList className="grid w-full grid-cols-2 mb-6 h-14 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger 
                      value="card" 
                      className="flex items-center gap-2 h-12 rounded-lg data-[state=active]:shadow-md transition-all"
                    >
                      <CreditCard className="h-5 w-5" />
                      <span className="font-medium">Cartão</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="boleto" 
                      className="flex items-center gap-2 h-12 rounded-lg data-[state=active]:shadow-md transition-all"
                    >
                      <FileText className="h-5 w-5" />
                      <span className="font-medium">Boleto</span>
                    </TabsTrigger>
                  </TabsList>

                  {creatingIntent ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="text-center">
                        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" style={{ color: primaryColor }} />
                        <p className="text-muted-foreground">Preparando pagamento...</p>
                      </div>
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
                            borderRadius: "12px",
                            fontFamily: "system-ui, sans-serif",
                          },
                          rules: {
                            ".Input": {
                              border: "1px solid #e2e8f0",
                              boxShadow: "none",
                              padding: "12px 16px",
                            },
                            ".Input:focus": {
                              border: `2px solid ${primaryColor}`,
                              boxShadow: "none",
                            },
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
                      <TabsContent value="boleto" className="mt-0">
                        <BoletoPaymentForm 
                          clientSecret={clientSecret}
                          amount={subscription.monthly_value}
                          primaryColor={primaryColor}
                          customerData={customerData}
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
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-lg border-0 sticky top-4">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold tracking-wide">RESUMO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Product Info */}
                <div className="flex gap-4 p-4 bg-muted/30 rounded-xl">
                  <div 
                    className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold shadow-md shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {subscription.asset.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold truncate">{subscription.asset.name}</h4>
                    <p className="text-sm text-muted-foreground">{subscription.plan_name}</p>
                    <p className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
                      R$ {subscription.monthly_value.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">R$ {subscription.monthly_value.toFixed(2).replace(".", ",")}</span>
                  </div>
                  
                  <div className="flex justify-between items-baseline pt-3 border-t border-border">
                    <span className="font-semibold">Total</span>
                    <div className="text-right">
                      <span 
                        className="text-3xl font-bold"
                        style={{ color: primaryColor }}
                      >
                        R$ {subscription.monthly_value.toFixed(2).replace(".", ",")}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        em até 12x no cartão
                      </p>
                    </div>
                  </div>
                </div>

                {/* Security Badge */}
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl p-4 mt-4">
                  <Shield className="h-5 w-5" style={{ color: primaryColor }} />
                  <span>Pagamento seguro processado pelo Stripe</span>
                </div>
              </CardContent>
            </Card>

            {subscription.asset.checkout_message && (
              <Card className="shadow-lg border-0">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center italic">
                    "{subscription.asset.checkout_message}"
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
