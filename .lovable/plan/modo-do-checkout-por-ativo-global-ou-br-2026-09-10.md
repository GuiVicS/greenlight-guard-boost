# Modo do checkout por ativo: Global ou BR

Hoje o idioma, a moeda e os meios de pagamento do checkout vêm do campo "país" da assinatura. A ideia é decidir isso no próprio ativo, com duas opções claras.

## O que o usuário verá

No formulário de criação/edição de ativos, um novo seletor **Modo do checkout**:

- **Brasil (BR)** — checkout em português, valores em R$, com Pix (Mercado Pago), cartão e boleto (Stripe), campo de CPF/CNPJ.
- **Global** — checkout em inglês, valores em US$, **apenas cartão** (Stripe), sem Pix e sem boleto, sem campo de CPF/CNPJ.

Na lista de ativos, uma etiqueta indica o modo (BR / Global). Ativos já existentes continuam em BR.

## Como funciona no checkout

- A página de checkout passa a ler o modo direto do ativo, ignorando o país da assinatura para idioma/moeda.
- No modo Global, os meios de pagamento são filtrados para cartão Stripe, mesmo que Pix e boleto estejam ativos nas integrações.
- No modo BR, nada muda em relação ao comportamento atual.
- Na tela de sucesso e nas mensagens de erro, os textos seguem o mesmo modo.

## Detalhes técnicos

1. **Banco**: nova coluna `assets.checkout_mode TEXT NOT NULL DEFAULT 'br'` com `CHECK (checkout_mode IN ('br','global'))`. Migração aditiva, sem quebrar nada.
2. **`src/pages/Assets.tsx`**: incluir `checkout_mode` no `formData`, no insert/update, no `handleEdit` e um `Select` com as duas opções + badge na listagem.
3. **`src/pages/Checkout.tsx`**: adicionar `checkout_mode` ao `select` da assinatura; derivar `country = asset.checkout_mode === 'global' ? 'US' : 'BR'` e usar esse valor em `getTranslations` / `formatCurrency`; filtrar `paymentMethods` para somente `card` quando global.
4. **`src/lib/checkout-utils.ts`**: garantir que a configuração `US` esteja completa (inglês, `USD`, sem documento obrigatório); ajustar/incluir se faltar.
5. **`src/components/checkout/StepPayment.tsx` e `StepIdentification.tsx`**: continuam recebendo `country`, já suportam inglês; esconder o campo de documento quando a configuração do país não exigir.
6. **Assinatura recorrente Stripe**: o Price criado automaticamente passa a usar a moeda do modo do ativo (`brl` ou `usd`) em `create-stripe-recurring-price`.
7. Regenerar os tipos do banco após a migração e validar o build.

## Fora do escopo

Tradução do painel administrativo (segue em português) e cobrança recorrente em outras moedas além de BRL/USD.
