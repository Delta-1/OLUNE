# Identidade do OLUNE no LINKY

O formulário de cadastro e login continua no OLUNE. E-mail, senha e identificador de identidade pertencem ao mesmo Supabase Auth usado pelo LINKY. O aplicativo mantém o vínculo com empresa, papel e dados de trabalho. Não há botão alternativo de login nem abertura de outra guia.

## Configuração

Ative `LINKY_NATIVE_AUTH=true` e configure `LINKY_SUPABASE_URL`, `LINKY_SUPABASE_PUBLISHABLE_KEY` e `LINKY_OLUNE_CLIENT_ID`. O projeto de identidade deve ser o projeto Supabase compartilhado já configurado em `SUPABASE_URL`. A chave administrativa existente permanece exclusivamente no servidor. Nenhuma chave secreta é enviada ao navegador.

Contas locais antigas são vinculadas ao identificador central após a validação da senha LINKY. Se ainda não existir identidade central, a senha local válida permite migrar a conta uma vez. A senha de uma conta LINKY existente nunca é substituída pela senha local. Após a vinculação, o OLUNE remove seu hash local. Sessões antigas sem vínculo precisam entrar novamente.

Uma conta que só existe no LINKY é reconhecida pelo login e recebe a etapa de vínculo: cadastrar uma empresa ou usar o convite do RH. A identidade, por si só, não concede acesso a empresas ou função administrativa. Novos cadastros que exigirem confirmação de e-mail não recebem uma sessão antes de confirmar.

## Licenças

Os vínculos são registrados em `linky_account_links`; a licença da empresa é associada ao administrador em `linky_subscriptions`. No primeiro acesso de uma empresa vinculada, o período local é registrado no LINKY somente se ainda não houver uma assinatura central. Uma licença já administrada no LINKY é preservada. Status `canceled` ou `past_due` bloqueia alterações e ponto; os relatórios continuam acessíveis. Datas e planos definidos no painel central são consultados pelo OLUNE.

Pagamentos confirmados e extensões explícitas atualizam a licença central. Alterações de preferências de cobrança não sobrescrevem decisões administrativas do LINKY. Funcionários compartilham a licença da empresa; não é criada uma assinatura para cada colaborador.

A recuperação é solicitada na tela do OLUNE e envia o fluxo de recuperação da conta central por e-mail. A nova senha vale no LINKY e no OLUNE. O antigo código de recuperação por WhatsApp não cria uma senha independente quando a identidade central está ativa.

## Validação

`npm run check`, `npm run build` e `npm test`. A suíte `tests/native-identity.test.js` cobre autenticação central, vínculo pendente, recusa de identidade divergente, confirmação de e-mail, recuperação, troca de senha, revogação de sessão e bloqueio por licença central.
