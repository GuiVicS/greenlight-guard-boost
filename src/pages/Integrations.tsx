import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  Mail, 
  Webhook,
  ArrowRight,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import whatsappLogo from '@/assets/whatsapp-logo.png';
import stripeLogo from '@/assets/stripe-logo.png';
import mercadopagoLogo from '@/assets/mercadopago-logo.jpeg';

interface IntegrationCard {
  id: string;
  name: string;
  description: string;
  icon?: React.ElementType;
  logoUrl?: string;
  iconColor: string;
  iconBg: string;
  path: string;
  category: 'communication' | 'payment' | 'automation';
}

const integrations: IntegrationCard[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Envie cobranças e notificações via WhatsApp com Evolution API',
    logoUrl: whatsappLogo,
    iconColor: 'text-[#25D366]',
    iconBg: 'bg-[#25D366]/20',
    path: '/integrations/billing',
    category: 'communication',
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Configure envio de emails de cobrança com Resend',
    icon: Mail,
    iconColor: 'text-[#6366F1]',
    iconBg: 'bg-[#6366F1]/20',
    path: '/integrations/billing',
    category: 'communication',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Aceite pagamentos com cartão de crédito e boleto',
    logoUrl: stripeLogo,
    iconColor: 'text-[#635BFF]',
    iconBg: 'bg-[#635BFF]/20',
    path: '/payment-gateways',
    category: 'payment',
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    description: 'Aceite pagamentos via PIX no Brasil',
    logoUrl: mercadopagoLogo,
    iconColor: 'text-[#00B1EA]',
    iconBg: 'bg-[#00B1EA]/20',
    path: '/payment-gateways',
    category: 'payment',
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Envie notificações de eventos para sistemas externos',
    icon: Webhook,
    iconColor: 'text-[#F97316]',
    iconBg: 'bg-[#F97316]/20',
    path: '/integrations/webhooks',
    category: 'automation',
  },
];

const categories = [
  { id: 'communication', label: 'Comunicação' },
  { id: 'payment', label: 'Pagamentos' },
  { id: 'automation', label: 'Automação' },
];

export default function Integrations() {
  const navigate = useNavigate();
  const [configuredIntegrations, setConfiguredIntegrations] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkIntegrations();
  }, []);

  async function checkIntegrations() {
    try {
      const [stripeRes, mpRes, billingRes] = await Promise.all([
        supabase.from('stripe_settings').select('is_configured').maybeSingle(),
        supabase.from('mercadopago_settings').select('is_configured').maybeSingle(),
        supabase.from('billing_settings').select('is_enabled, evolution_api_url, sender_email').maybeSingle(),
      ]);

      setConfiguredIntegrations({
        stripe: stripeRes.data?.is_configured || false,
        mercadopago: mpRes.data?.is_configured || false,
        whatsapp: !!(billingRes.data?.evolution_api_url),
        email: !!(billingRes.data?.sender_email),
      });
    } catch (error) {
      console.error('Error checking integrations:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Integrações</h1>
          <p className="text-muted-foreground mt-1">
            Conecte seus serviços favoritos para automatizar cobranças e pagamentos
          </p>
        </div>

        {categories.map(category => {
          const categoryIntegrations = integrations.filter(i => i.category === category.id);
          if (categoryIntegrations.length === 0) return null;

          return (
            <div key={category.id} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{category.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {categoryIntegrations.map(integration => {
                  const isConfigured = configuredIntegrations[integration.id];
                  const Icon = integration.icon;

                  return (
                    <button
                      key={integration.id}
                      onClick={() => navigate(integration.path)}
                      className={cn(
                        "glass-card p-6 text-left transition-all duration-200",
                        "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
                        "group cursor-pointer"
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden",
                          integration.iconBg
                        )}>
                          {integration.logoUrl ? (
                            <img 
                              src={integration.logoUrl} 
                              alt={integration.name} 
                              className="w-8 h-8 object-contain rounded"
                            />
                          ) : Icon ? (
                            <Icon className={cn("w-6 h-6", integration.iconColor)} />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{integration.name}</h3>
                            {!loading && (
                              isConfigured ? (
                                <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              )
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {integration.description}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
