# Plano: Assinatura Stripe recorrente automática

## O que vamos fazer

Tornar o SiteGuard capaz de criar, na Stripe, um produto e um price recorrente (`recurring: { interval: 'month' }`) automaticamente toda vez que uma assinatura for salva com gateway Stripe. O `price_id` gerado será vinculado ao ativo, e o checkout passará a usar o modo `subscription` da Stripe quando esse price existir.

## Por que isso importa

Hoje a cobrança mensal depende de você colar manualmente o `price_...` no ativo, e o checkout cria cobranças avulsas. Com esse plano, a recorrência passa a ser gerenciada pela própria Stripe: faturas, retries, webhooks e cancelamento automático.

## Escopo

1. **Backend — criação automática de produto/price na Stripe**
   - Ao criar ou editar uma assinatura no painel, se o método `card` estiver ativo e configurado para Stripe, a edge function `create-stripe-recurring-price` será chamada.
   - A função cria um `Product` e um `Price` (`type=recurring`, `interval=month`) na Stripe usando o `plan_name` e `monthly_value` da assinatura.
   - O `price.id` retornado será salvo em:
     - `assets.stripe_price_id` (do ativo vinculado)
     - `subscriptions.stripe_price_id` (referência da assinatura)

2. **Frontend — página de Assinaturas**
   - Adicionar toggle "Cobrar recorrente pela Stripe" no formulário de nova/editar assinatura (visível apenas quando Stripe está ativo/configurado).
   - Ao salvar com esse toggle ligado, chamar a edge function antes do `insert/update`.
   - Exibir o `stripe_price_id` e `stripe_subscription_id` (quando existir) nos cards de assinatura.

3. **Checkout — modo Subscription quando houver price_id**
   - Se `asset.stripe_price_id` existir e o método for cartão com gateway Stripe, o checkout usará `mode: 'subscription'` com `line_items[0][price]=<stripe_price_id>`.
   - Se não houver `stripe_price_id`, mantém o comportamento atual (`mode: 'payment'` ou PIX/boleto/Mercado Pago).
   - Após `checkout.session.completed`, salvar `stripe_subscription_id` na assinatura local.

4. **Webhook Stripe**
   - Reaproveitar os eventos já tratados: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`.
   - Quando `checkout.session.completed` retornar `mode: subscription`, registrar a assinatura Stripe vinculada.

5. **Integração com webhooks outbound**
   - Disparar eventos `subscription.created` e `subscription.canceled` via `webhook-dispatcher` quando uma assinatura Stripe for criada ou cancelada.

## O que não muda

- Pagamentos via Mercado Pago (PIX, boleto, cartão) continuam no fluxo atual.
- Pagamentos avulsos Stripe sem `stripe_price_id` continuam funcionando.
- O bloqueio/desbloqueio por inadimplência segue a mesma regra.

## Dúvida rápida para você

Você quer que a cobrança recorrente seja **obrigatória** para todas as assinaturas Stripe, ou prefere um **toggle por assinatura** ("Cobrar recorrente pela Stripe")?
