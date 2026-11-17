# OLUNE · identidade e atualização

Versão 3.6.0. Nome oficial: **OLUNE**. Assinatura: **Ponto e pessoas em um só lugar.** A identidade mantém o relógio roxo e os dois ponteiros animados em sequência, no sentido horário.

## Arquivos da marca

Em `public/brand/` estão os SVGs com letras convertidas em curvas: logo escura (fundos claros), logo clara (fundos escuros), logo roxa, ícone e símbolo transparente. O pacote de entrega acrescenta PNGs, PDFs vetoriais, tamanhos de ícone e tutoriais. O SVG abre no Figma, Inkscape, Illustrator e ferramentas que aceitam SVG; não depende da fonte instalada.

- Roxo: `#A68BFA`.
- Fundo: `#17141E`.
- Texto claro: `#F6F3FF`.
- Texto escuro: `#181229`.
- Preserve a proporção e uma margem livre mínima de um quarto da largura do ícone.
- Em tamanhos menores que 160 px para a marca completa, prefira apenas o ícone. Para impressão, use PDF ou SVG.

## O que foi renomeado

Interface, acesso, cadastro, carregamento, mensagens transacionais, identificação da Flora, relatórios exportados, crachás do sistema, instalação PWA, rótulo Android, tarefas de publicação e documentação. Repositório: `Delta-1/OLUNE`. Serviço de produção no Railway: `OLUNE`.

## Compatibilidade preservada

O domínio de serviço `oluni.up.railway.app` continua sendo o endereço operacional das instalações existentes. Não substitua por um domínio não configurado. O projeto Railway que contém o serviço também contém outros aplicativos; renomeie somente o serviço OLUNE. O banco compartilhado não deve ser renomeado como se fosse exclusivo deste aplicativo.

Mantenha `br.com.oluni.app`, a assinatura Android, o protocolo de atualizações, as chaves de sessão, QR Codes já impressos, assinaturas de crachás, namespaces `moodcorp:*` e o segredo criptográfico existente. São identificadores internos de continuidade, não a marca pública. Alterá-los exige uma migração específica e pode invalidar logins, arquivos ou atualizações.

O APK se chama `OLUNE.apk`. O workflow mantém também `Oluni.apk` como alias para o atualizador instalado. O manifesto assinado mantém a URL anterior, aceita pelos aplicativos existentes; os dois nomes entregam os mesmos bytes. O canal `android-preview` usa assinatura temporária enquanto a assinatura permanente não for provisionada. Não prometa atualização automática de produção antes dessa configuração.

## Chave de IA padrão

No Railway: serviço **OLUNE → Variables**. Para novas configurações:

```dotenv
OLUNE_AI_PROVIDER=gemini
OLUNE_AI_MODEL=gemini-2.5-flash
OLUNE_AI_API_KEY=cole-a-chave-do-provedor-aqui
OLUNE_AI_ENABLED=true
```

Para OpenAI, selecione `OLUNE_AI_PROVIDER=openai` e um modelo disponível na conta, por exemplo o padrão configurado `gpt-5-mini`. Aplique as variáveis e aguarde o deploy. Em **WhatsApp → Bot**, habilite o assistente e teste a conexão. Os nomes anteriores `OLUNI_AI_*` continuam aceitos; quando os dois existem, `OLUNE_AI_*` têm prioridade. Chaves são lidas no servidor e não entram no app, nos materiais ou no GitHub. Uma chave da empresa configurada no painel continua independente da integração padrão.

Para a criptografia, a ordem é diferente por segurança dos registros existentes: `OLUNI_SECRET`, depois `MOODCORP_SECRET`, depois `OLUNE_SECRET`. Mantenha a variável já usada. Se for transferir para o novo nome, copie exatamente o mesmo valor e remova a anterior somente em uma implantação controlada. Renomear a marca não exige essa mudança.

## Publicar

1. Execute `npm ci --ignore-scripts`, `npm run check`, `npm test` e `npm run build`.
2. Publique na branch `main` do repositório OLUNE. O Railway continua ligado ao mesmo repositório por identidade; confira **Settings → Source**.
3. Confira `/api/health`: serviço `OLUNE`, versão `3.6.0`, banco disponível. Confira `/api/client-version`.
4. Em Actions, acompanhe **Publicar OLUNE** e **Gerar OLUNE para Android**. O build Pages determina o caminho pela variável `GITHUB_REPOSITORY`, então acompanha o nome real do repositório.
5. O site publicado em Pages passa a usar `/OLUNE/`; o caminho antigo do Pages não é uma garantia de redirecionamento. Atualize favoritos, links de divulgação e QR Codes de instalação que apontem para Pages. Links assinados de convite/crachá continuam usando o endereço da implantação.
6. Instale o novo APK ou atualize o PWA. No Android, a atualização exige o mesmo certificado e a confirmação do instalador.

## Tutorial de conferência

- Tela de acesso, título da aba e instalação mostram OLUNE.
- Cadastro continua por convite e login por e-mail/senha.
- Colaborador reconhecido conversa com Flora; visitante recebe menu de atendimento.
- Atestados seguem para conferência em Documentos antes do arquivamento.
- Os canais, setores, permissões e dados da implantação permanecem vinculados aos registros existentes.
- A chave de IA e os quatro segredos de assinatura Android são configurados pelo responsável; não são fornecidos no pacote de marca.
