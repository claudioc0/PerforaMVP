# Política de Privacidade do Perfora

**Última atualização:** 3 de agosto de 2026

O Perfora ("nós", "nosso app") é um aplicativo de acompanhamento de nutrição
e treino. Esta política explica quais dados coletamos, por que coletamos, e
como você pode controlá-los.

## 1. Dados que coletamos

### 1.1 Dados de conta
Nome, e-mail e senha (armazenada apenas de forma criptografada — nunca em
texto puro) para criar e autenticar sua conta.

### 1.2 Dados de nutrição e corpo
- Metas de calorias, proteínas, carboidratos e gorduras que você define
- Refeições que você registra: descrição e valores nutricionais
- Fotos de pratos ou de rótulos de produtos que você tira para análise por
  IA (ver seção 3 — essas fotos **não ficam armazenadas** nos nossos
  servidores após a análise)
- Registros de peso corporal que você insere
- Fotos de progresso corporal que você opta por tirar e salvar no app —
  essas **ficam armazenadas** de forma vinculada à sua conta, pra você
  acompanhar sua evolução ao longo do tempo

### 1.3 Dados de treino
Treinos, exercícios, séries, repetições e cargas que você registra.

### 1.4 Dados de sensores/saúde do aparelho
Se você conceder a permissão do Android Health Connect, o app **lê** (sem
nunca enviar ao nosso servidor) passos, calorias ativas e frequência
cardíaca do dia, só pra exibir na tela inicial. Esses dados permanecem no
seu aparelho e no Health Connect do próprio sistema — não trafegam pra
nenhum servidor nosso.

### 1.5 Dados de uso do app
Quantas análises de IA você já usou no dia (pra controlar o limite gratuito
diário) e se sua conta é premium.

## 2. Permissões usadas pelo app

| Permissão | Pra que serve |
|---|---|
| Câmera | Fotografar refeições, rótulos de produtos e fotos de progresso corporal |
| Notificações | Lembretes locais (registrar refeição, beber água, treinar) que você ativa |
| Health Connect (passos, calorias ativas, frequência cardíaca) | Exibir sua atividade do dia direto na tela inicial |

Nenhuma dessas permissões é usada pra rastreamento, publicidade ou qualquer
finalidade além da descrita.

## 3. Compartilhamento com terceiros

- **Google Gemini API**: quando você fotografa uma refeição ou rótulo pra
  estimativa automática de valores nutricionais, ou quando o app gera seu
  insight diário, a imagem e/ou o texto da refeição são enviados à API do
  Google Gemini pra análise. O Google processa essa informação segundo a
  própria política de privacidade da API Gemini. Não guardamos essas fotos
  depois da análise — elas passam pelo nosso servidor só de forma
  transitória, sem ficar salvas em disco.
- **Hospedagem**: os dados da sua conta (nome, e-mail, metas, refeições,
  treinos, fotos de progresso) ficam armazenados em um banco de dados
  hospedado no Render.com, que atua como nosso processador de dados.

Não vendemos, alugamos ou compartilhamos seus dados com anunciantes. O
Perfora não tem SDKs de publicidade ou de rastreamento de terceiros.

## 4. Retenção e exclusão de dados

Seus dados ficam armazenados enquanto sua conta existir. Para solicitar a
exclusão da sua conta e de todos os dados associados (refeições, treinos,
fotos, metas), entre em contato pelo e-mail abaixo — a exclusão remove em
cascata todos os registros vinculados à sua conta.

## 5. Segurança

Senhas são armazenadas com hash (nunca em texto puro). A comunicação entre
o app e o servidor usa HTTPS. O acesso aos seus dados é protegido por
autenticação (token JWT), e cada usuário só acessa seus próprios registros.

## 6. Crianças

O Perfora não é direcionado a menores de 13 anos e não coletamos
intencionalmente dados de crianças.

## 7. Alterações nesta política

Podemos atualizar esta política ocasionalmente. Mudanças relevantes serão
comunicadas dentro do app.

## 8. Contato

Dúvidas sobre esta política ou sobre seus dados: **claudiocolomboferreira@gmail.com**
