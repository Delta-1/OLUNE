# Teste grátis do OLUNE

## Como funciona
- Empresa nova: **7 dias grátis**, sem cartão (`OLUNE_TRIAL_DAYS` muda o número).
- Empresas que já existiam: o teste começa no **primeiro acesso depois desta atualização**, para ninguém ser bloqueado de surpresa.
- Durante o teste, o admin vê uma faixa discreta com os dias que faltam e uma barra de progresso. Nos **2 últimos dias** a faixa fica amarela e o botão "Ver planos" fica em destaque.
- **No último dia**, a tela de planos aparece logo depois do login (o admin pode "Decidir depois").
- **Quando acaba sem plano**: a empresa fica em **somente leitura**. Tudo continua visível (relatórios, documentos, histórico), mas nada novo é gravado: o servidor responde `402` para qualquer gravação, inclusive o totem. Sair da conta e trocar a senha continuam liberados. **Nenhum dado é apagado.**
  - O admin vê a tela "Seus 7 dias grátis terminaram" com os planos, ou pode escolher "Só consultar meus dados".
  - O colaborador vê o aviso "O acesso da empresa está pausado. O RH precisa ativar o plano."
  - O WhatsApp continua **recebendo** mensagens (para não perder contato de clientes), mas a equipe não consegue responder pelo painel até o plano ser ativado.

## Ativar uma empresa (enquanto o Mercado Pago não está integrado)
No Railway, em Variables:
```
OLUNE_PAID_COMPANIES=11222333000181:2027-11-30,52998224725:2027-05-31
```
CPF ou CNPJ (com ou sem pontuação) e a data até quando está pago. A empresa é liberada na hora seguinte em que alguém abrir o app.

Para o botão "Continuar com o plano X" abrir o seu WhatsApp com a mensagem pronta:
```
OLUNE_SALES_WHATSAPP=5568999999999
```

Emergência: `OLUNE_BILLING=off` desliga o bloqueio para todo mundo.

## Próximo passo
O webhook do Mercado Pago (ver `mercadopago-integracao.md`) só precisa gravar `paidUntil` no registro `billing` da empresa (`lookup(secret,'billing',companyId)`). O resto já está pronto.
