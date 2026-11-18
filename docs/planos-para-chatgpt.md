# OLUNE – Tela de Planos (demonstração) — contexto para continuar o projeto

Estou desenvolvendo o OLUNE (repositório GitHub `Delta-1/OLUNE`, deploy na Railway). É um app de ponto, pessoas e atendimento por WhatsApp. O front é **React + TypeScript + Vite** (`src/`), o back é **Node/Express** (`server/`), e o app Android é feito com **Capacitor** (`mobile/`).

## O que já foi feito
Criei uma **tela de planos de pagamento só para demonstração**, ainda sem cobrança real.

### Arquivos novos
- `src/plans.tsx`: componente `Plans` com os 3 planos. Também exporta `PLANS`, `FEATURES`, `savedPlan()` e os tipos `Plan`/`PlanId`.
- `src/plans.css`: estilos que usam os mesmos tokens do OLUNE (`--pn-bg`, `--pn-panel`, `--pn-border`, `--pn-accent` #a68bfa, `--pn-green` #80d6b0) e as classes já existentes (`pn-auth`, `pn-tag`, `pn-label`, `pn-button`).

### Alterações em `src/OluneApp.tsx`
1. Novo estado `showPlans`. No `onEnter` do `SignIn` (login feito com sucesso), ele recebe `true`. Assim a tela de planos aparece **logo depois do login**, antes do painel.
2. Quando `showPlans` é `true`, o app mostra `<Plans onDone onSkip/>` em tela cheia. "Continuar com o plano X" ou "Decidir depois" levam ao painel normal.
3. Nova aba **"Planos"** (ícone `CreditCard`) no menu "Mais", tanto para admin quanto para colaborador. Ela mostra `<Plans embedded/>` dentro do layout (página `plans`).
4. Quando a sessão já estava salva (com "Manter conectado"), a tela de planos não reaparece ao reabrir o app. Ela só aparece depois de um login de fato.

### Planos e valores (base: mensal R$ 200)
| Plano | Desconto | Valor/mês | Total cobrado | Economia |
|---|---|---|---|---|
| Mensal | 0% | R$ 200 | R$ 200 por mês | — |
| Semestral | 15% | R$ 170 | R$ 1.020 a cada 6 meses | R$ 180 |
| Anual (destaque "Mais vantajoso") | 25% | R$ 150 | R$ 1.800 por ano | R$ 600 |

Os valores são calculados em `src/plans.tsx` a partir de `BASE = 200` e do desconto de cada plano. Para mudar os preços, basta alterar esses números.

### Comportamento atual (demo)
- A escolha do plano fica salva **apenas no navegador**, em `localStorage` na chave `olune:plan`, e aparece um aviso (toast) "Plano X selecionado."
- **Não existe** backend, cobrança, tabela no banco nem bloqueio de acesso por plano.

## O que falta fazer (próximos passos com integrações)
1. **Gateway de pagamento**: escolher Mercado Pago, Stripe, Asaas ou Pagar.me (para o Brasil, Pix + cartão + boleto é o ideal). Criar no gateway os produtos/preços recorrentes dos 3 planos.
2. **Backend (`server/`)**:
   - `GET /billing/plans`: devolve os planos (tirar os valores fixos do front).
   - `POST /billing/checkout`: recebe `{planId}`, cria a assinatura/checkout no gateway para a empresa logada (só admin) e devolve a URL ou o QR do Pix.
   - `POST /billing/webhook`: recebe os eventos do gateway (pagamento aprovado, recusado, cancelado ou renovado), valida a assinatura do webhook e atualiza o status.
   - `GET /billing/subscription`: devolve o status da assinatura da empresa.
3. **Banco de dados**: tabela `subscriptions` (company_id, plan_id, status [trialing/active/past_due/canceled], gateway_customer_id, gateway_subscription_id, current_period_end, created_at). O projeto usa `@supabase/supabase-js`.
4. **Front**:
   - Em `Plans`, trocar o `confirm()` que hoje grava no `localStorage` por uma chamada a `api('/billing/checkout',{planId})` e redirecionar para o pagamento.
   - Mostrar a tela de planos depois do login **só** para admin de empresa sem assinatura ativa (usar os dados do `/bootstrap`, ex.: `data.company.subscription`).
   - Colaborador não deve escolher plano, só ver a mensagem "a assinatura é gerenciada pelo RH".
   - Na aba "Planos", mostrar o plano atual, a próxima cobrança e um botão para trocar ou cancelar.
5. **Período de teste e bloqueio**: definir os dias de trial e o que acontece quando a assinatura vence (aviso, modo somente leitura etc.).
6. **Testes**: os testes ficam em `tests/*.test.js` e rodam com `npm test`. Faltam testes para o webhook e para as regras de acesso por plano.
