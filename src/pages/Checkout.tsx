import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, Shield, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckoutTimeline } from "@/components/checkout/CheckoutTimeline";
import { StepIdentification } from "@/components/checkout/StepIdentification";
import { StepPayment } from "@/components/checkout/StepPayment";
import { formatCurrency, getTranslations } from "@/lib/checkout-utils";

interface SubscriptionData {
  id: string;
  plan_name: string;
  monthly_value: number;
  country: string;
  stripe_price_id: string | null;
  asset: {
    id: string;
    name: string;
    type: string;
    checkout_mode: string | null;
    stripe_price_id: string | null;
    infoproduct_url: string | null;
    checkout_logo_url: string | null;
    checkout_message: string | null;
    checkout_primary_color: string | null;
    checkout_theme: 'light' | 'dark' | null;
    checkout_title: string | null;
    checkout_favicon_url: string | null;
    checkout_description: string | null;
    client: {
      name: string;
      email: string;
    };
  };
}

interface PaymentMethodConfig {
  method_name: string;
  gateway_type: string;
  is_enabled: boolean;
}

export default function Checkout() {
  const { assetId } = useParams();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get("return_url");
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "boleto" | "pix">("card");
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    document: "",
  });

  useEffect(() => {
    fetchSubscription();
    fetchPaymentMethods();
  }, [assetId]);

  const fetchPaymentMethods = async () => {
    try {
      const { data } = await supabase
        .from("payment_methods_config")
        .select("method_name, gateway_type, is_enabled")
        .eq("is_enabled", true);

      if (data) {
        setPaymentMethods(data);
      }
    } catch (error) {
      console.error("Error fetching payment methods:", error);
    }
  };

  const fetchSubscription = async () => {
    if (!assetId) return;

    try {
      // Busca qualquer assinatura do asset (não apenas overdue) para permitir cobranças avulsas
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id,
          plan_name,
          monthly_value,
          country,
          stripe_price_id,
          asset:assets!inner (
            id,
            name,
            type,
            checkout_mode,
            stripe_price_id,
            infoproduct_url,
            checkout_logo_url,
            checkout_message,
            checkout_primary_color,
            checkout_theme,
            checkout_title,
            checkout_favicon_url,
            checkout_description,
            client:clients (
              name,
              email
            )
          )
        `)
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setHasError(true);
        toast({
          title: "Erro",
          description: "Nenhuma assinatura encontrada para este ativo",
          variant: "destructive",
        });
        return;
      }

      setHasError(false);
      const subscriptionData = data as unknown as SubscriptionData;
      setSubscription(subscriptionData);

      // Apply custom checkout branding
      applyCheckoutBranding(subscriptionData);

      // Pre-fill customer email if available
      if (subscriptionData.asset.client.email) {
        setCustomerData((prev) => ({ ...prev, email: subscriptionData.asset.client.email }));
      }
      if (subscriptionData.asset.client.name) {
        setCustomerData((prev) => ({ ...prev, name: subscriptionData.asset.client.name }));
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
      setHasError(true);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do pagamento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyCheckoutBranding = (subscriptionData: SubscriptionData) => {
    // Set page title
    const title = subscriptionData.asset.checkout_title || `Checkout - ${subscriptionData.asset.name}`;
    document.title = title;
    
    // Set meta description
    const description = subscriptionData.asset.checkout_description || 
      `Regularize seu pagamento para ${subscriptionData.asset.name}`;
    let metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    } else {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      metaDescription.setAttribute('content', description);
      document.head.appendChild(metaDescription);
    }
    
    // Set custom favicon
    if (subscriptionData.asset.checkout_favicon_url) {
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (favicon) {
        favicon.href = subscriptionData.asset.checkout_favicon_url;
      } else {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.href = subscriptionData.asset.checkout_favicon_url;
        document.head.appendChild(favicon);
      }
    }
  };

  // Regra fixa: cartão e boleto sempre pela Stripe; Pix sempre pelo Mercado Pago
  const methodUsesStripe = (method: string): boolean => method === 'card' || method === 'boleto';

  // Assinatura recorrente com price recorrente na Stripe: pagamento transparente (sem checkout hospedado)
  const isRecurringCard = (method: string): boolean => {
    if (method !== 'card') return false;
    const priceId = subscription?.asset.stripe_price_id || subscription?.stripe_price_id;
    return methodUsesStripe(method) && !!priceId;
  };



  const createPaymentIntent = async (method: "card" | "boleto") => {
    if (!subscription) return;

    // Only create Stripe payment intent if the method uses Stripe
    if (!methodUsesStripe(method)) {
      console.log(`Method ${method} uses Mercado Pago, skipping Stripe payment intent`);
      return;
    }

    setCreatingIntent(true);
    setClientSecret(null);

    try {
      const recurring = isRecurringCard(method);
      const { data, error } = await supabase.functions.invoke(
        recurring ? "create-subscription-intent" : "create-payment-intent",
        {
          body: recurring
            ? {
                subscriptionId: subscription.id,
                customer: { name: customerData.name, email: customerData.email },
              }
            : {
                subscriptionId: subscription.id,
                paymentMethod: method,
                // Salvar cartão para débito automático quando for pagamento com cartão
                saveCardForAutoCharge: method === "card",
              },
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.publishableKey) {
        setStripePromise(loadStripe(data.publishableKey));
      }

      // Fatura já quitada com o cartão salvo do cliente
      if (data.alreadyPaid) {
        setCreatingIntent(false);
        await handlePaymentSuccess();
        return;
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

  const handleGoToPayment = () => {
    setCurrentStep(2);
    // Inicia o pagamento Stripe automaticamente (cartão e boleto), inclusive recorrente:
    // a cobrança só acontece após o cliente preencher o formulário e confirmar.
    if (
      subscription &&
      !clientSecret &&
      paymentMethod !== "pix" &&
      methodUsesStripe(paymentMethod)
    ) {
      createPaymentIntent(paymentMethod as "card" | "boleto");
    }
  };

  const handlePaymentMethodChange = (method: "card" | "boleto" | "pix") => {
    setPaymentMethod(method);
    if (method !== "pix" && methodUsesStripe(method)) {
      createPaymentIntent(method);
    }
  };




  const handlePaymentSuccess = async () => {
    setCurrentStep(3);
    setPaymentSuccess(true);
    
    // Immediately try to unblock the asset via backend function
    if (subscription) {
      try {
        await supabase.functions.invoke("unlock-asset-after-payment", {
          body: {
            subscriptionId: subscription.id,
            assetId: subscription.asset.id,
          },
        });
        console.log("Asset unlocked successfully");
      } catch (error) {
        console.error("Error unlocking asset:", error);
      }
    }

    // Determine redirect URL: infoproduct_url takes priority, then return_url
    const redirectUrl = subscription?.asset.type === 'infoproduct' && subscription?.asset.infoproduct_url
      ? subscription.asset.infoproduct_url
      : returnUrl ? decodeURIComponent(returnUrl) : null;

    // Redirect after a short delay
    if (redirectUrl) {
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 3000);
    }
  };

  const handleBackToIdentification = () => {
    setCurrentStep(1);
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

  const isGlobalCheckout = subscription?.asset?.checkout_mode === 'global';
  const country = isGlobalCheckout ? 'US' : (subscription?.country || 'BR');
  const t = getTranslations(country);

  // Tela de erro ao carregar dados
  if (hasError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3 text-slate-900">Erro ao carregar</h2>
            <p className="text-slate-600">
              Não foi possível carregar os dados do pagamento. Tente novamente mais tarde.
            </p>
            <Button 
              onClick={() => window.location.reload()}
              className="mt-6"
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se não há subscription, a tela de erro já foi mostrada
  if (!subscription) {
    return null;
  }

  const primaryColor = subscription.asset.checkout_primary_color || "#10B981";
  const isDarkTheme = subscription.asset.checkout_theme === 'dark';
  const showBoleto = !isGlobalCheckout && paymentMethods.some(m => m.method_name === 'boleto' && m.is_enabled);
  const showPix = !isGlobalCheckout && paymentMethods.some(m => m.method_name === 'pix' && m.is_enabled);
  const showCard = isGlobalCheckout || paymentMethods.some(m => m.method_name === 'card' && m.is_enabled);
  const formattedAmount = formatCurrency(subscription.monthly_value, country);
  
  // Determine redirect URL: infoproduct_url takes priority, then return_url
  const redirectUrl = subscription.asset.type === 'infoproduct' && subscription.asset.infoproduct_url
    ? subscription.asset.infoproduct_url
    : returnUrl ? decodeURIComponent(returnUrl) : null;

  if (paymentSuccess) {
    return (
      <div className={`min-h-screen ${isDarkTheme 
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-100'}`}
      >
        {/* Header */}
        <header className={`border-b border-border/50 py-4 px-4 shadow-sm ${isDarkTheme ? 'bg-slate-900' : 'bg-white'}`}>
          <div className="container max-w-6xl mx-auto flex items-center justify-between">
            {subscription.asset.checkout_logo_url ? (
              <img 
                src={subscription.asset.checkout_logo_url} 
                alt="Logo" 
                className="max-h-10 object-contain"
              />
            ) : (
              <div className={`font-bold text-xl ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{subscription.asset.name}</div>
            )}
            <div className={`flex items-center gap-2 text-sm ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">{t.securePayment.toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Timeline */}
        <div className="container max-w-4xl mx-auto px-4">
          <CheckoutTimeline currentStep={3} primaryColor={primaryColor} isDarkTheme={isDarkTheme} />
        </div>

        <div className="container max-w-md mx-auto p-4">
          <Card className={`shadow-xl border-0 ${isDarkTheme ? 'bg-slate-800/90' : ''}`}>
            <CardContent className="pt-8 pb-8 text-center">
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <CheckCircle className="h-10 w-10" style={{ color: primaryColor }} />
              </div>
              <h2 className={`text-2xl font-bold mb-3 ${isDarkTheme ? 'text-white' : ''}`}>
                {subscription.asset.type === 'infoproduct'
                  ? (isGlobalCheckout ? 'Access released!' : 'Acesso Liberado!')
                  : t.allGood}
              </h2>
              <p className={`mb-4 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
                {isGlobalCheckout
                  ? (subscription.asset.type === 'infoproduct'
                    ? 'Your payment was approved and your access is now available!'
                    : 'Your payment was approved and the website has been unblocked!')
                  : (subscription.asset.type === 'infoproduct'
                    ? 'Seu pagamento foi aprovado e seu acesso foi liberado!'
                    : 'Seu pagamento foi aprovado e o site foi desbloqueado!')}
              </p>
              
              {(redirectUrl) && (
                <p className={`text-sm ${isDarkTheme ? 'text-slate-500' : 'text-muted-foreground'}`}>
                  {isGlobalCheckout
                    ? 'Redirecting you in a few seconds...'
                    : (subscription.asset.type === 'infoproduct'
                      ? 'Redirecionando para o conteúdo em alguns segundos...'
                      : 'Redirecionando para o site em alguns segundos...')}
                </p>
              )}
              
              {(redirectUrl) && (
                <button
                  onClick={() => window.location.href = redirectUrl}
                  className="mt-4 px-6 py-2 rounded-lg text-white font-medium transition-colors"
                  style={{ backgroundColor: primaryColor }}
                >
                  {isGlobalCheckout
                    ? (subscription.asset.type === 'infoproduct' ? 'Access content now' : 'Go to the website now')
                    : (subscription.asset.type === 'infoproduct' ? 'Acessar conteúdo agora' : 'Ir para o site agora')}
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkTheme 
      ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' 
      : 'bg-gradient-to-br from-slate-50 via-white to-slate-100'}`}
    >
      {/* Top Header */}
      <header className={`border-b border-border/50 py-4 px-4 shadow-sm ${isDarkTheme ? 'bg-slate-900' : 'bg-white'}`}>
        <div className="container max-w-6xl mx-auto flex items-center justify-between">
          {subscription.asset.checkout_logo_url ? (
            <img 
              src={subscription.asset.checkout_logo_url} 
              alt="Logo" 
              className="max-h-10 object-contain"
            />
          ) : (
            <div className={`font-bold text-xl ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{subscription.asset.name}</div>
          )}
          <div className={`flex items-center gap-2 text-sm ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">{t.securePayment.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      <div 
        className="w-full py-3 text-center text-sm font-medium text-white shadow-md"
        style={{ backgroundColor: primaryColor }}
      >
        {t.attentionBanner}
      </div>

      {/* Timeline */}
      <div className="container max-w-4xl mx-auto px-4">
        <CheckoutTimeline currentStep={currentStep} primaryColor={primaryColor} isDarkTheme={isDarkTheme} />
      </div>

      <div className="container max-w-3xl mx-auto p-4 pb-8">
        <div className="flex flex-col items-center">
          {/* Forms */}
          <div className="w-full">
            {currentStep === 1 && (
              <StepIdentification
                customerData={customerData}
                onChange={setCustomerData}
                onNext={handleGoToPayment}
                primaryColor={primaryColor}
                isDarkTheme={isDarkTheme}
                country={country}
              />
            )}

            {currentStep === 2 && (
              <StepPayment
                subscription={subscription}
                customerData={customerData}
                stripePromise={stripePromise}
                clientSecret={clientSecret}
                creatingIntent={creatingIntent}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={handlePaymentMethodChange}
                onSuccess={handlePaymentSuccess}
                onBack={handleBackToIdentification}
                primaryColor={primaryColor}
                isDarkTheme={isDarkTheme}
                showBoleto={showBoleto}
                showPix={showPix}
                showCard={showCard || (!showPix && !showBoleto)}
                returnUrl={returnUrl || undefined}
                paymentMethods={paymentMethods}
                stripePriceId={subscription.asset.stripe_price_id || subscription.stripe_price_id}
              />

            )}
          </div>

          {/* Optional message */}
          {subscription.asset.checkout_message && (
            <Card className={`mt-6 w-full shadow-lg border-0 ${isDarkTheme ? 'bg-slate-800/90' : 'bg-white'}`}>
              <CardContent className="pt-6">
                <p className={`text-sm text-center italic ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                  "{subscription.asset.checkout_message}"
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
