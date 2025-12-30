// Checkout utilities for internationalization and currency formatting

export type CountryCode = 'BR' | 'US' | 'PT' | 'ES' | 'MX';

interface CountryConfig {
  currency: string;
  currencySymbol: string;
  locale: string;
  documentLabel: string;
  documentPlaceholder: string;
  documentMask?: (value: string) => string;
  namePlaceholder: string;
}

const countryConfigs: Record<CountryCode, CountryConfig> = {
  BR: {
    currency: 'brl',
    currencySymbol: 'R$',
    locale: 'pt-BR',
    documentLabel: 'CPF',
    documentPlaceholder: '000.000.000-00',
    documentMask: (value: string) => {
      const numbers = value.replace(/\D/g, "").slice(0, 11);
      return numbers
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    },
    namePlaceholder: 'ex: Maria de Almeida Cruz',
  },
  US: {
    currency: 'usd',
    currencySymbol: '$',
    locale: 'en-US',
    documentLabel: 'Tax ID (optional)',
    documentPlaceholder: '000-00-0000',
    documentMask: (value: string) => {
      const numbers = value.replace(/\D/g, "").slice(0, 9);
      return numbers
        .replace(/(\d{3})(\d)/, "$1-$2")
        .replace(/(\d{2})(\d)/, "$1-$2");
    },
    namePlaceholder: 'e.g. John Smith',
  },
  PT: {
    currency: 'eur',
    currencySymbol: '€',
    locale: 'pt-PT',
    documentLabel: 'NIF',
    documentPlaceholder: '000000000',
    documentMask: (value: string) => value.replace(/\D/g, "").slice(0, 9),
    namePlaceholder: 'ex: João Silva',
  },
  ES: {
    currency: 'eur',
    currencySymbol: '€',
    locale: 'es-ES',
    documentLabel: 'NIF/DNI',
    documentPlaceholder: '00000000X',
    documentMask: (value: string) => value.replace(/[^0-9A-Za-z]/g, "").slice(0, 9).toUpperCase(),
    namePlaceholder: 'ej: María García',
  },
  MX: {
    currency: 'mxn',
    currencySymbol: 'MX$',
    locale: 'es-MX',
    documentLabel: 'RFC (opcional)',
    documentPlaceholder: 'XXXX000000XXX',
    documentMask: (value: string) => value.replace(/[^0-9A-Za-z]/g, "").slice(0, 13).toUpperCase(),
    namePlaceholder: 'ej: Carlos Hernández',
  },
};

export function getCountryConfig(country: string): CountryConfig {
  const code = country.toUpperCase() as CountryCode;
  return countryConfigs[code] || countryConfigs.BR;
}

export function formatCurrency(amount: number, country: string): string {
  const config = getCountryConfig(country);
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency.toUpperCase(),
  }).format(amount);
}

export function getCurrencySymbol(country: string): string {
  return getCountryConfig(country).currencySymbol;
}

// Translations for checkout UI
interface CheckoutTranslations {
  paymentTitle: string;
  customerInfo: string;
  selectPaymentMethod: string;
  creditCard: string;
  boleto: string;
  boletoDescription: string;
  cardDescription: string;
  name: string;
  email: string;
  securePayment: string;
  payButton: string;
  processing: string;
  attentionBanner: string;
  allGood: string;
  allGoodDescription: string;
  backToSite: string;
  orderSummary: string;
  total: string;
}

const translations: Record<string, CheckoutTranslations> = {
  'pt-BR': {
    paymentTitle: 'Pagamento',
    customerInfo: 'Suas informações',
    selectPaymentMethod: 'Forma de pagamento',
    creditCard: 'Cartão de crédito',
    boleto: 'Boleto bancário',
    boletoDescription: 'Vencimento em 3 dias úteis',
    cardDescription: 'Pagamento instantâneo',
    name: 'Nome completo',
    email: 'E-mail',
    securePayment: 'Pagamento 100% seguro',
    payButton: 'Pagar',
    processing: 'Processando...',
    attentionBanner: 'Após a confirmação do pagamento, seu acesso será liberado automaticamente.',
    allGood: 'Tudo certo!',
    allGoodDescription: 'Não há pagamentos pendentes para este ativo.',
    backToSite: 'Voltar ao site',
    orderSummary: 'Resumo do pedido',
    total: 'Total',
  },
  'en-US': {
    paymentTitle: 'Payment',
    customerInfo: 'Your information',
    selectPaymentMethod: 'Payment method',
    creditCard: 'Credit card',
    boleto: 'Bank slip',
    boletoDescription: 'Due in 3 business days',
    cardDescription: 'Instant payment',
    name: 'Full name',
    email: 'Email',
    securePayment: '100% Secure payment',
    payButton: 'Pay',
    processing: 'Processing...',
    attentionBanner: 'After payment confirmation, your access will be automatically enabled.',
    allGood: 'All good!',
    allGoodDescription: 'There are no pending payments for this asset.',
    backToSite: 'Back to site',
    orderSummary: 'Order summary',
    total: 'Total',
  },
  'pt-PT': {
    paymentTitle: 'Pagamento',
    customerInfo: 'As suas informações',
    selectPaymentMethod: 'Método de pagamento',
    creditCard: 'Cartão de crédito',
    boleto: 'Referência bancária',
    boletoDescription: 'Vencimento em 3 dias úteis',
    cardDescription: 'Pagamento instantâneo',
    name: 'Nome completo',
    email: 'E-mail',
    securePayment: 'Pagamento 100% seguro',
    payButton: 'Pagar',
    processing: 'A processar...',
    attentionBanner: 'Após a confirmação do pagamento, o seu acesso será liberado automaticamente.',
    allGood: 'Tudo certo!',
    allGoodDescription: 'Não existem pagamentos pendentes para este ativo.',
    backToSite: 'Voltar ao site',
    orderSummary: 'Resumo do pedido',
    total: 'Total',
  },
  'es-ES': {
    paymentTitle: 'Pago',
    customerInfo: 'Tu información',
    selectPaymentMethod: 'Método de pago',
    creditCard: 'Tarjeta de crédito',
    boleto: 'Transferencia bancaria',
    boletoDescription: 'Vencimiento en 3 días hábiles',
    cardDescription: 'Pago instantáneo',
    name: 'Nombre completo',
    email: 'Correo electrónico',
    securePayment: 'Pago 100% seguro',
    payButton: 'Pagar',
    processing: 'Procesando...',
    attentionBanner: 'Después de la confirmación del pago, tu acceso se habilitará automáticamente.',
    allGood: '¡Todo bien!',
    allGoodDescription: 'No hay pagos pendientes para este activo.',
    backToSite: 'Volver al sitio',
    orderSummary: 'Resumen del pedido',
    total: 'Total',
  },
  'es-MX': {
    paymentTitle: 'Pago',
    customerInfo: 'Tu información',
    selectPaymentMethod: 'Forma de pago',
    creditCard: 'Tarjeta de crédito',
    boleto: 'Transferencia bancaria',
    boletoDescription: 'Vencimiento en 3 días hábiles',
    cardDescription: 'Pago instantáneo',
    name: 'Nombre completo',
    email: 'Correo electrónico',
    securePayment: 'Pago 100% seguro',
    payButton: 'Pagar',
    processing: 'Procesando...',
    attentionBanner: 'Después de la confirmación del pago, tu acceso se habilitará automáticamente.',
    allGood: '¡Todo listo!',
    allGoodDescription: 'No hay pagos pendientes para este activo.',
    backToSite: 'Volver al sitio',
    orderSummary: 'Resumen del pedido',
    total: 'Total',
  },
};

export function getTranslations(country: string): CheckoutTranslations {
  const config = getCountryConfig(country);
  return translations[config.locale] || translations['pt-BR'];
}
