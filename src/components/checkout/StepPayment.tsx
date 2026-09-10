import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, FileText, ArrowLeft, Wallet, QrCode, ExternalLink } from "lucide-react";
import { useState } from "react";
import { CardPaymentForm } from "./CardPaymentForm";
import { BoletoPaymentForm } from "./BoletoPaymentForm";
import { PixPaymentForm } from "./PixPaymentForm";
import { MercadoPagoCardForm } from "./MercadoPagoCardForm";
import { MercadoPagoBoletoForm } from "./MercadoPagoBoletoForm";
import { getTranslations } from "@/lib/checkout-utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaymentMethodConfig {
  method_name: string;
  gateway_type: string;
  is_enabled: boolean;
}

interface StepPaymentProps {
  subscription: {
    id: string;
    monthly_value: number;
    country: string;
  };
  customerData: {
    name: string;
    email: string;
    document: string;
  };
  stripePromise: ReturnType<typeof loadStripe> | null;
  clientSecret: string | null;
  creatingIntent: boolean;
  paymentMethod: "card" | "boleto" | "pix";
  onPaymentMethodChange: (method: "card" | "boleto" | "pix") => void;
  onSuccess: () => void;
  onBack: () => void;
  primaryColor: string;
  isDarkTheme?: boolean;
  showBoleto: boolean;
  showPix: boolean;
  showCard: boolean;
  returnUrl?: string;
  paymentMethods: PaymentMethodConfig[];
  stripePriceId?: string | null;
}

export function StepPayment({
  subscription,
  customerData,
  stripePromise,
  clientSecret,
  creatingIntent,
  paymentMethod,
  onPaymentMethodChange,
  onSuccess,
  onBack,
  primaryColor,
  isDarkTheme = false,
  showBoleto,
  showPix,
  showCard,
  returnUrl,
  paymentMethods,
  stripePriceId,
}: StepPaymentProps) {
  const country = subscription.country || 'BR';
  const t = getTranslations(country);
  const locale = country === 'BR' ? 'pt-BR' : country === 'PT' ? 'pt' : country === 'ES' || country === 'MX' ? 'es' : 'en';
  const { toast } = useToast();
  const [stripeCheckoutLoading, setStripeCheckoutLoading] = useState(false);

  // Determine which gateway to use for each payment method
  const getGatewayForMethod = (method: string): string => {
    const config = paymentMethods.find(m => m.method_name === method && m.is_enabled);
    return config?.gateway_type || 'mercadopago';
  };

  const cardGateway = getGatewayForMethod('card');
  const boletoGateway = getGatewayForMethod('boleto');
  const pixGateway = getGatewayForMethod('pix');

  // Calculate grid columns based on available methods
  const methodCount = (showCard ? 1 : 0) + (showBoleto ? 1 : 0) + (showPix ? 1 : 0);

  // Check if current method uses Stripe
  const currentMethodUsesStripe = (
    (paymentMethod === 'card' && cardGateway === 'stripe') ||
    (paymentMethod === 'boleto' && boletoGateway === 'stripe')
  );

  return (
    <Card className={`shadow-lg border-0 overflow-hidden ${isDarkTheme ? 'bg-slate-800/90' : ''}`}>
      <CardHeader className={`pb-4 ${isDarkTheme 
        ? 'bg-gradient-to-r from-slate-800 to-slate-700' 
        : 'bg-gradient-to-r from-slate-50 to-white'}`}
      >
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className={`text-xl ${isDarkTheme ? 'text-white' : ''}`}>{t.paymentTitle}</CardTitle>
            <p className={`text-sm mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
              {t.selectPaymentMethod}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <Tabs value={paymentMethod} onValueChange={(v) => onPaymentMethodChange(v as "card" | "boleto" | "pix")}>
          <TabsList className={`grid w-full mb-6 h-14 p-1 rounded-xl ${isDarkTheme ? 'bg-slate-700/50' : 'bg-muted/50'}`} style={{ gridTemplateColumns: `repeat(${methodCount}, 1fr)` }}>
            {showCard && (
              <TabsTrigger 
                value="card" 
                className={`flex items-center gap-2 h-12 rounded-lg data-[state=active]:shadow-md transition-all ${isDarkTheme ? 'data-[state=active]:bg-slate-600 text-white' : ''}`}
              >
                <CreditCard className="h-5 w-5" />
                <span className="font-medium hidden sm:inline">{t.creditCard}</span>
              </TabsTrigger>
            )}
            {showPix && (
              <TabsTrigger 
                value="pix" 
                className={`flex items-center gap-2 h-12 rounded-lg data-[state=active]:shadow-md transition-all ${isDarkTheme ? 'data-[state=active]:bg-slate-600 text-white' : ''}`}
              >
                <QrCode className="h-5 w-5" />
                <span className="font-medium hidden sm:inline">Pix</span>
              </TabsTrigger>
            )}
            {showBoleto && (
              <TabsTrigger 
                value="boleto" 
                className={`flex items-center gap-2 h-12 rounded-lg data-[state=active]:shadow-md transition-all ${isDarkTheme ? 'data-[state=active]:bg-slate-600 text-white' : ''}`}
              >
                <FileText className="h-5 w-5" />
                <span className="font-medium hidden sm:inline">{t.boleto}</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* PIX Tab - Always uses Mercado Pago */}
          <TabsContent value="pix" className="mt-0">
            <PixPaymentForm
              subscriptionId={subscription.id}
              amount={subscription.monthly_value}
              primaryColor={primaryColor}
              customerData={customerData}
              onSuccess={onSuccess}
              isDarkTheme={isDarkTheme}
              returnUrl={returnUrl}
            />
          </TabsContent>

          {/* Card Tab */}
          <TabsContent value="card" className="mt-0">
            {cardGateway === 'stripe' ? (
              // Stripe Card Payment
              <>
                {creatingIntent ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" style={{ color: primaryColor }} />
                      <p className="text-muted-foreground">{t.processing}</p>
                    </div>
                  </div>
                ) : stripePromise && clientSecret ? (
                  <Elements 
                    stripe={stripePromise} 
                    options={{ 
                      clientSecret,
                      appearance: {
                        theme: isDarkTheme ? "night" : "stripe",
                        variables: {
                          colorPrimary: primaryColor,
                          borderRadius: "12px",
                          fontFamily: "system-ui, sans-serif",
                          colorBackground: isDarkTheme ? "#1e293b" : "#ffffff",
                          colorText: isDarkTheme ? "#ffffff" : "#1e293b",
                        },
                        rules: {
                          ".Input": {
                            border: isDarkTheme ? "1px solid #475569" : "1px solid #e2e8f0",
                            boxShadow: "none",
                            padding: "12px 16px",
                            backgroundColor: isDarkTheme ? "#334155" : "#ffffff",
                            color: isDarkTheme ? "#ffffff" : "#1e293b",
                          },
                          ".Input:focus": {
                            border: `2px solid ${primaryColor}`,
                            boxShadow: "none",
                          },
                          ".Label": {
                            color: isDarkTheme ? "#cbd5e1" : "#64748b",
                          },
                        },
                      },
                      locale: locale as any,
                    }}
                  >
                    <CardPaymentForm 
                      amount={subscription.monthly_value}
                      primaryColor={primaryColor}
                      onSuccess={onSuccess}
                      isDarkTheme={isDarkTheme}
                      country={country}
                    />
                  </Elements>
                ) : (
                  <div className={`text-center py-12 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
                    {country === 'BR' 
                      ? 'Erro ao carregar formulário de pagamento. Tente novamente.'
                      : 'Error loading payment form. Please try again.'}
                  </div>
                )}
              </>
            ) : (
              // Mercado Pago Card Payment
              <MercadoPagoCardForm
                subscriptionId={subscription.id}
                amount={subscription.monthly_value}
                primaryColor={primaryColor}
                customerData={customerData}
                onSuccess={onSuccess}
                isDarkTheme={isDarkTheme}
                country={country}
              />
            )}
          </TabsContent>

          {/* Boleto Tab */}
          <TabsContent value="boleto" className="mt-0">
            {boletoGateway === 'stripe' ? (
              // Stripe Boleto Payment
              <>
                {creatingIntent ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" style={{ color: primaryColor }} />
                      <p className="text-muted-foreground">{t.processing}</p>
                    </div>
                  </div>
                ) : stripePromise && clientSecret ? (
                  <Elements 
                    stripe={stripePromise} 
                    options={{ 
                      clientSecret,
                      appearance: {
                        theme: isDarkTheme ? "night" : "stripe",
                        variables: {
                          colorPrimary: primaryColor,
                          borderRadius: "12px",
                          fontFamily: "system-ui, sans-serif",
                          colorBackground: isDarkTheme ? "#1e293b" : "#ffffff",
                          colorText: isDarkTheme ? "#ffffff" : "#1e293b",
                        },
                      },
                      locale: locale as any,
                    }}
                  >
                    <BoletoPaymentForm 
                      clientSecret={clientSecret}
                      amount={subscription.monthly_value}
                      primaryColor={primaryColor}
                      customerData={customerData}
                      onSuccess={onSuccess}
                      isDarkTheme={isDarkTheme}
                    />
                  </Elements>
                ) : (
                  <div className={`text-center py-12 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
                    {country === 'BR' 
                      ? 'Erro ao carregar formulário de pagamento. Tente novamente.'
                      : 'Error loading payment form. Please try again.'}
                  </div>
                )}
              </>
            ) : (
              // Mercado Pago Boleto Payment
              <MercadoPagoBoletoForm
                subscriptionId={subscription.id}
                amount={subscription.monthly_value}
                primaryColor={primaryColor}
                customerData={customerData}
                onSuccess={onSuccess}
                isDarkTheme={isDarkTheme}
                country={country}
              />
            )}
          </TabsContent>
        </Tabs>

        <Button
          onClick={onBack}
          variant="ghost"
          className={`w-full mt-4 ${isDarkTheme ? 'text-slate-400 hover:text-white' : ''}`}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {country === 'BR' ? 'Voltar' : 'Back'}
        </Button>
      </CardContent>
    </Card>
  );
}