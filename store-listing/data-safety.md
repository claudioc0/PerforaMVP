# Formulário de Segurança de Dados (Play Console)

Guia de respostas pro formulário "Data safety" do Play Console. Os nomes
exatos dos campos podem variar um pouco conforme a versão do formulário —
use isso como referência, não como texto pra colar 1:1.

## O app coleta ou compartilha algum dado do usuário?
**Sim.**

## Tipos de dados

### Informações pessoais
- **Nome** — Coletado. Finalidade: funcionalidade do app. Obrigatório
  (necessário pra criar conta).
- **Endereço de e-mail** — Coletado. Finalidade: funcionalidade do app
  (login/autenticação). Obrigatório.
- **Senha**: nunca armazenada em texto puro (só hash) — normalmente não
  precisa ser declarada separadamente, mas confira a orientação atual do
  formulário.

### Saúde e fitness
- **Informações de fitness** (treinos, exercícios, séries, repetições,
  cargas) — Coletado. Finalidade: funcionalidade do app. Opcional (só se o
  usuário registrar treinos).
- **Informações de saúde** (peso corporal, metas de calorias/macros,
  refeições registradas) — Coletado. Finalidade: funcionalidade do app.
  Opcional na maior parte (registrar refeição/peso é op­cional, mas metas
  são pedidas no onboarding).
- **Passos, calorias ativas, frequência cardíaca** (via Health Connect) —
  **Não enviado a servidor nenhum** — processado só localmente no
  aparelho pra exibição. Declarar como "coletado" mas **não** "compartilhado",
  e marcar que não sai do dispositivo se o formulário tiver essa opção.

### Fotos e vídeos
- **Fotos** — Coletado.
  - Fotos de refeição/rótulo: enviadas à API Google Gemini pra análise e
    **descartadas em seguida** (não ficam armazenadas em disco/banco).
  - Fotos de progresso corporal: **armazenadas**, vinculadas à conta do
    usuário, até ele excluir a conta.
  - Finalidade: funcionalidade do app. Opcional (usuário escolhe usar a
    câmera ou preencher manualmente).

### Atividade no app
- **Interações no app** (contagem de análises de IA usadas no dia) —
  Coletado. Finalidade: funcionalidade do app (limite de uso gratuito).

## Os dados são compartilhados com terceiros?
**Sim, parcialmente.** Fotos de refeição/rótulo e o texto de refeições
descritas manualmente são enviados à **API Google Gemini** para gerar a
estimativa nutricional e o insight diário. Isso é processamento a serviço
da funcionalidade principal do app (não é venda, não é publicidade, não é
analytics de terceiros). Se o formulário pedir uma categoria de
"finalidade do compartilhamento", use **funcionalidade do app**.

Não há SDKs de anúncio, analytics de terceiros ou revenda de dados.

## Os dados são criptografados em trânsito?
**Sim** — toda comunicação app↔servidor usa HTTPS.

## O usuário pode solicitar a exclusão dos dados?
**Sim** — mediante contato com o desenvolvedor (ver política de
privacidade), a conta e todos os dados vinculados são excluídos.

## Práticas de segurança
- Dados criptografados em trânsito (HTTPS)
- Senhas armazenadas com hash, nunca em texto puro
- Usuário pode solicitar exclusão dos dados
- [Confirmar se existe um processo de revisão independente de segurança —
  se não, deixar essa opção sem marcar]
