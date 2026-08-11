# Perfora — Nutrição e Treino com IA

App de acompanhamento de nutrição e treino: registro de refeições por foto (estimativa
automática de calorias/macros via Google Gemini), sessões de treino com séries/cargas,
evolução de peso e fotos de progresso, passos/frequência cardíaca via Health Connect, e
lembretes locais. Backend Flask (API REST) + app mobile em React Native/Expo, disponível
em português, inglês e espanhol.

**Em produção:** backend hospedado no Render (`https://perfora-api.onrender.com`), banco
Postgres real. App ainda não publicado na Play Store — em preparação (ver
[`store-listing/`](store-listing/)).

## Arquitetura geral

Dois projetos independentes, sem acoplamento direto de código — só se comunicam via HTTP.

```
nutrition-app/
├── backend/                          # API Flask
│   ├── app/
│   │   ├── __init__.py               # Application factory (create_app), JWT loaders, blueprints
│   │   ├── config.py                 # Config central (env vars) + TestConfig
│   │   ├── extensions.py             # Instâncias compartilhadas (db, cors, limiter)
│   │   ├── models/
│   │   │   ├── user.py               # Usuário (senha com hash, is_premium, cota diária de IA)
│   │   │   ├── meal.py               # Refeição — items (JSON) guarda o detalhamento por alimento
│   │   │   ├── user_goals.py         # Metas de macros/calorias
│   │   │   ├── water_log.py          # Consumo de água
│   │   │   ├── weight_log.py         # Histórico de peso (log_date sincronizado com created_at)
│   │   │   ├── progress_photo.py     # Foto de progresso corporal (uma por dia)
│   │   │   ├── favorite_meal.py      # Refeições salvas como favoritas
│   │   │   ├── food_cache.py         # Cache global de macros por alimento
│   │   │   ├── text_analysis_cache.py# Cache de análise de refeição por texto
│   │   │   ├── token_blocklist.py    # JWTs revogados (logout)
│   │   │   ├── workout.py            # Sessão de treino
│   │   │   ├── set_log.py            # Série (peso × reps) de um treino
│   │   │   ├── exercise.py           # Catálogo de exercícios (global, compartilhado)
│   │   │   ├── workout_split.py      # Divisão de treino (catálogo global, ex: push/pull/legs)
│   │   │   ├── split_day.py / split_day_exercise.py  # Dias de uma divisão e seus exercícios
│   │   │   └── weekly_plan.py / weekly_plan_day.py    # Plano semanal do usuário (seg–dom)
│   │   ├── services/
│   │   │   ├── gemini_service.py       # Única camada que conhece o SDK do Gemini
│   │   │   ├── meal_service.py         # Orquestra IA + persistência de refeição
│   │   │   ├── ai_quota_service.py     # Cota diária de análises de IA + bypass premium
│   │   │   ├── food_cache_service.py   # Consulta/alimenta o FoodCache
│   │   │   ├── text_analysis_cache_service.py
│   │   │   ├── user_service.py         # Metas, água, peso
│   │   │   ├── streak_service.py       # Sequência de dias seguidos
│   │   │   ├── report_service.py       # Exporta relatório (PDF/CSV) de progresso
│   │   │   ├── workout_service.py      # Sessões de treino e séries
│   │   │   ├── exercise_service.py     # Catálogo de exercícios
│   │   │   ├── split_service.py        # Divisões de treino
│   │   │   └── weekly_plan_service.py  # Plano semanal
│   │   ├── routes/
│   │   │   ├── auth_routes.py      # /api/auth — register, login, refresh, logout
│   │   │   ├── meals_routes.py     # /api/meals — analyze, save, favorites, insight diário...
│   │   │   ├── user_routes.py      # /api/user — goals, water, weight, progress-photos, report
│   │   │   └── workouts_routes.py  # /api/workouts — treinos, séries, exercícios, splits, plano
│   │   └── utils/
│   │       ├── dates.py            # Fuso local vs UTC (evita virada de dia errada)
│   │       ├── file_uploads.py     # Allowlist de extensão de imagem
│   │       ├── nutrition.py        # Faixa sanitária de calorias/macros
│   │       ├── meal_aggregation.py # Soma de macros a partir de itens
│   │       ├── pagination.py
│   │       └── text.py
│   ├── migrations/                 # Alembic (flask db migrate/upgrade)
│   ├── tests/                      # pytest — 39 arquivos, ~270 testes
│   ├── scripts/                    # Utilitários fora do runtime da API
│   ├── uploads/progress_photos/    # Fotos de progresso salvas em disco (não versionado)
│   ├── instance/                   # nutrition.db (SQLite local, não versionado)
│   ├── run.py                      # Entry point (gunicorn aponta pra cá em produção)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                        # App Expo (React Native)
│   ├── App.js                       # Fontes, ThemeProvider + LanguageProvider, navigator
│   ├── app.json                     # Config Expo (ícone, splash, permissões Android)
│   ├── eas.json                     # Build profiles (development/preview/production)
│   ├── src/
│   │   ├── navigation/              # AppNavigator (stack), DrawerContent, rotas
│   │   ├── screens/                 # 18 telas — auth, dashboard, câmera, treino, insights...
│   │   ├── components/              # AppAlertProvider, ErrorBoundary, LogoMark, gráficos
│   │   ├── contexts/                # UserContext (metas/perfil)
│   │   ├── theme/                   # Tema claro/escuro
│   │   ├── hooks/                   # useCyclingMessages, useScaledMealItems
│   │   ├── i18n/                    # i18next — locales/{pt,en,es}/*.json por tela
│   │   ├── services/                # api.js, healthConnect.js, secureTokenStorage.js, notifications.js
│   │   └── utils/                   # formatDate, adjustedGoals, mealMacros, streak, loadProgression
│   └── package.json
│
├── render.yaml                      # Blueprint de deploy (Render: API + Postgres)
├── docs/privacy-policy.html         # Política de privacidade (servida via GitHub Pages)
└── store-listing/                   # Ficha da loja, política de privacidade (fonte) e Data Safety
```

## Por que essa separação (baixo acoplamento)

- **`gemini_service.py`** é o único arquivo que conhece o SDK do Gemini. Trocar de provider de IA
  no futuro significa mudar só esse arquivo.
- **`meal_service.py`**/**`workout_service.py`** conectam IA/regra de negócio ao banco, mas não
  sabem nada sobre HTTP — reaproveitáveis fora do Flask (worker assíncrono, CLI).
- Rotas (`*_routes.py`) são finas: só traduzem HTTP em chamadas de serviço, sempre derivando o
  usuário do JWT (`get_jwt_identity()`), nunca de um campo enviado pelo cliente.
- O **prompt do Gemini é estrito** e força `response_mime_type: application/json`, eliminando
  parsing frágil de texto livre. Cada alimento de uma foto é identificado **separadamente**, com
  sua própria estimativa de gramas.
- **`food_cache_service.py`** garante que o mesmo alimento sempre use os mesmos macros de
  referência entre análises diferentes, em vez de variar a cada chamada de IA.
- **`ai_quota_service.py`** limita análises gratuitas por dia (5/usuário) sem bloquear o app —
  o fallback de entrada manual continua disponível; conta `is_premium=True` ignora o limite.
- No frontend, **`api.js`** é o único ponto de contato com o backend — telas nunca fazem `fetch`
  diretamente. **`src/i18n/`** segue o mesmo princípio para texto: cada tela registra seu próprio
  namespace de tradução, sem strings soltas no JSX.

## Segurança

- Senhas com hash (Werkzeug), nunca texto puro. Validação de força de senha no registro.
- Tokens JWT de acesso (1h) e refresh (7 dias), com blocklist de revogação no logout (o
  refresh token também é revogado, não só o access token).
- Rate limiting por usuário (não por IP) em rotas sensíveis: login/registro, chamadas de IA,
  criação de exercício no catálogo global.
- `SECRET_KEY`/`JWT_SECRET_KEY` sem fallback inseguro — o serviço falha ao subir se não
  estiverem definidos (fail fast). `CORS_ORIGINS` fecha tudo por padrão em produção.
- Toda query de dado pertencente a usuário (refeição, treino, série, peso, foto) filtra por
  `user_id` vindo do JWT — nunca do payload do cliente. Recurso de outro usuário devolve 404
  (não 403), sem confirmar que o ID existe.
- Upload de imagem (foto de refeição, rótulo, progresso) é reaberto com Pillow no servidor
  antes de ser usado/salvo — extensão sozinha não basta, o conteúdo precisa ser uma imagem
  de verdade. Fotos de progresso são regravadas reencodadas (não os bytes originais).
- Valores nutricionais informados manualmente (calorias/macros) passam por uma faixa sanitária
  antes de persistir — mesmo padrão já aplicado a peso corporal.
- Tokens de autenticação no app ficam em `expo-secure-store` (Keystore/Keychain
  criptografado), não em AsyncStorage.
- Suite de testes (`backend/tests/`) cobre hashing de senha, rate limiting, tokens
  ausentes/inválidos/expirados/revogados, IDOR (recurso de outro usuário), e as validações
  de upload/faixa de valores acima.

## Rodando o backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # e preencha as chaves (veja comentários no arquivo)
flask db upgrade                 # aplica as migrations no SQLite local
python run.py
```

A API sobe em `http://localhost:5000`. Se for testar em um celular físico ou emulador Android,
o frontend precisa apontar para um IP acessível a partir do dispositivo (veja seção do frontend).
Por padrão usa SQLite local; definir `DATABASE_URL` aponta pra Postgres (é o que roda em produção).

### Rodando os testes

```bash
cd backend
venv\Scripts\pytest -v
```

Os testes rodam contra um SQLite em memória (`TestConfig`), isolado do banco de desenvolvimento.

## Rodando o frontend

O projeto usa **Expo Dev Client** (não Expo Go) — necessário porque o app usa módulos nativos
(câmera, Health Connect, notificações, ícones vetoriais) que exigem um build nativo próprio.

```bash
cd frontend
npm install
copy .env.example .env           # ajuste EXPO_PUBLIC_API_URL pro seu ambiente
```

**Emulador Android:** use `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api` no `.env` — `10.0.2.2` é
o endereço fixo que o emulador usa para alcançar o `localhost` da máquina host.

**Celular físico:** use o IP da sua máquina na rede local (ex: `http://192.168.0.10:5000/api`) —
celular e computador precisam estar na mesma rede Wi-Fi. **Esse IP muda entre sessões** (DHCP) —
se a conexão parar de funcionar do nada, confira o IP atual antes de qualquer outro diagnóstico.

Primeira vez (gera o projeto nativo e instala no dispositivo/emulador conectado):

```bash
npx expo run:android
```

Nas próximas vezes, só é preciso subir o Metro (o app já está instalado):

```bash
npx expo start --dev-client --clear
```

## Deploy

- **Backend**: `render.yaml` é um Blueprint do Render — provisiona o banco Postgres
  (`perfora-db`) e o serviço web (`perfora-api`) juntos. `GEMINI_API_KEY` é a única variável
  marcada `sync: false` (preenchida manualmente no dashboard); o resto é gerado ou derivado
  automaticamente. O Render sincroniza a partir da branch `main` — mudanças de backend em
  `dev` só chegam em produção depois de mescladas.
- **Frontend**: `eas.json` define os build profiles. `preview`/`production` já apontam
  `EXPO_PUBLIC_API_URL` pra API real do Render (não pro IP local) — só `development` usa o
  `.env` local.
- **Política de privacidade**: `docs/privacy-policy.html`, servida via GitHub Pages
  (`https://claudioc0.github.io/PerforaMVP/privacy-policy.html`), branch `dev` → pasta `/docs`.

## Preparação de lançamento (Play Store)

Conteúdo pronto em [`store-listing/`](store-listing/): ficha da loja (título, descrições,
categoria), política de privacidade (fonte em Markdown) e o rascunho de respostas do
formulário Data Safety do Play Console. Cota gratuita de IA (5 análises/dia) já tem fallback
de entrada manual — assinatura Premium ainda é só um placeholder de UI, sem checkout real.

## Próximos passos sugeridos

1. Concluir o cadastro no Google Play Console e publicar a primeira versão.
2. Ativar faturamento (billing) na chave do Gemini — o tier gratuito da API tem teto de
   ~20 requisições/dia **no total**, não por usuário, e vira gargalo real com poucos usuários
   simultâneos usando a análise por foto.
3. Play Billing real (assinatura Premium hoje é só placeholder de UI).
4. Job periódico de limpeza da tabela `token_blocklist` (só cresce hoje).
5. Fila assíncrona (Celery/RQ) se o volume de imagens crescer, para não bloquear a request HTTP
   na chamada ao Gemini.
6. Versionamento da API (`/api/v1/...`) para preparar integrações externas.
