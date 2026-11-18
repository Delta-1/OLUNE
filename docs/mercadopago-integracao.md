# OLUNE + Mercado Pago: qual API usar

## Recomendação curta
Usar **duas APIs do Mercado Pago**, uma para cada tipo de plano:

| Plano | API do Mercado Pago | Como a empresa paga |
|---|---|---|
| Mensal (R$ 200) | **Assinaturas** (`/preapproval`) | Cartão de crédito, cobrado automaticamente todo mês |
| Semestral (R$ 1.140) | **Checkout Pro** (`/checkout/preferences`) | Pagamento único: Pix, boleto ou cartão parcelado |
| Anual (R$ 2.160) | **Checkout Pro** (`/checkout/preferences`) | Pagamento único: Pix, boleto ou cartão parcelado (ex.: até 12x) |

E um **webhook** (`/billing/webhook`) para receber a confirmação dos pagamentos e ativar a empresa.

## Por que assim
- **Mensal = Assinaturas.** É a única forma de cobrar sozinho todo mês sem o RH ter que lembrar. As assinaturas recorrentes do Mercado Pago funcionam com cartão, não com Pix.
- **Semestral e anual = Checkout Pro.** É o discurso da apresentação: "paga uma vez e não pensa mais nisso". O Checkout Pro aceita **Pix e boleto**, que empresas pequenas preferem para valores maiores. Também aceita **cartão parcelado**, então os R$ 2.160 podem virar 12x no cartão do cliente e o OLUNE recebe o valor cheio.
- **Checkout Pro é a página do próprio Mercado Pago.** O OLUNE nunca toca nos dados do cartão, o que diminui a responsabilidade de segurança. A integração é a mais simples: o servidor cria a "preferência", o app abre o link e o Mercado Pago devolve o cliente para o OLUNE.
- **Renovação do semestral e do anual:** o OLUNE já tem WhatsApp. Perto do vencimento, o sistema manda o link de renovação para o admin pelo WhatsApp e mostra um aviso no app.

Alternativa mais simples (fase 1): usar **só o Checkout Pro** para os três planos, com o mensal pago mês a mês por link. Funciona, mas o mensal depende do cliente lembrar de pagar.

## Como encaixa no código atual
- O servidor é Express (`server/app.js`), com rotas no padrão `route('post','/caminho',handler)` e autenticação `auth` já pronta.
- O banco é o Supabase pela classe `store` (`server/store.js`), que guarda registros genéricos por tipo. Dá para criar o tipo `subscription` com `store.put('subscription', companyId, {...})` sem criar tabela nova.
- Instalar o SDK oficial: `npm install mercadopago`.
- Novas variáveis no Railway (nunca no código): `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_PUBLIC_URL` (endereço do app, para o retorno e o webhook).

### Rotas novas (`server/billing.js`)
1. `GET /billing/plans`: os 3 planos, com os valores no servidor (tirar os valores fixos de `src/plans.tsx`).
2. `POST /billing/checkout` (só admin), com `{planId}`:
   - `monthly`: cria o `preapproval` (R$ 200, `frequency: 1`, `frequency_type: "months"`) e devolve o `init_point`.
   - `semiannual`/`annual`: cria uma `preference` com 1 item (R$ 1.140 ou R$ 2.160), `external_reference = companyId:planId`, `notification_url`, `back_urls` e `auto_return: "approved"`, e devolve o `init_point`.
3. `POST /billing/webhook` (sem `auth`):
   - Valida a assinatura `x-signature` (HMAC SHA-256 com `MP_WEBHOOK_SECRET`) e recusa o que não bater.
   - Consulta o pagamento ou a assinatura na API do Mercado Pago. Nunca confia no corpo da notificação.
   - Atualiza `subscription` da empresa: `status` (`active`, `pending`, `past_due`, `canceled`), `planId`, `paidUntil` (+1, +6 ou +12 meses).
   - Ignora notificações repetidas (o Mercado Pago reenvia).
4. `GET /billing/subscription`: status para o app. Incluir também no `/bootstrap`.

### No app (`src/plans.tsx`)
- O botão "Continuar com o plano X" chama `api('/billing/checkout',{planId})` e abre o `init_point`. No Android (Capacitor), abrir no navegador.
- Ao voltar do pagamento, recarregar o `/bootstrap` e mostrar "Pagamento confirmado" ou "Aguardando pagamento" (Pix e boleto demoram alguns minutos para confirmar).
- Só o **admin** vê a tela de planos depois do login, e só se não houver assinatura ativa. O colaborador não escolhe plano.
- A aba "Planos" mostra o plano atual, até quando está pago e o botão de renovar ou trocar.

## Ordem sugerida
1. Criar a conta de desenvolvedor no Mercado Pago e pegar as **credenciais de teste**.
2. Checkout Pro para semestral e anual, mais o webhook. É o que mais vende no discurso.
3. Assinaturas para o mensal.
4. Bloqueio suave quando vencer (aviso e depois modo somente leitura) e lembrete pelo WhatsApp.
5. Testar com usuários e cartões de teste do Mercado Pago antes de usar as credenciais reais.
