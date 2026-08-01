# Perfora — App de Nutrição com IA

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-Expo-61DAFB?logo=react&logoColor=white)
![pytest](https://img.shields.io/badge/tests-pytest-0A9EDC?logo=pytest&logoColor=white)

Rastreamento nutricional com estimativa automática de calorias e macros por foto, usando
Google Gemini para identificar alimentos e estimar porções. Backend Flask (API REST) +
app mobile em React Native/Expo.

## Arquitetura geral

Dois projetos independentes, sem acoplamento direto de código — só se comunicam via HTTP.

```
nutrition-app/
├── backend/                        # API Flask
│   ├── app/
│   │   ├── __init__.py             # Application factory (create_app), JWT loaders
│   │   ├── config.py               # Config central (env vars) + TestConfig
│   │   ├── extensions.py           # Instâncias compartilhadas (db, cors, limiter)
│   │   ├── models/
│   │   │   ├── user.py             # Usuário (senha com hash, nunca em texto puro)
│   │   │   ├── meal.py             # Refeição — items (JSON) guarda o detalhamento por alimento
│   │   │   ├── user_goals.py       # Metas de macros/calorias do usuário
│   │   │   ├── water_log.py        # Registro de consumo de água
│   │   │   ├── favorite_meal.py    # Refeições salvas como favoritas
│   │   │   ├── weight_log.py       # Histórico de peso
│   │   │   ├── token_blocklist.py  # JWTs revogados (logout)
│   │   │   └── food_cache.py       # Cache global de macros por alimento (consistência entre análises)
│   │   ├── services/
│   │   │   ├── gemini_service.py       # Única camada que conhece o SDK do Gemini
│   │   │   ├── meal_service.py         # Orquestra IA + persistência (regra de negócio)
│   │   │   ├── food_cache_service.py   # Consulta/alimenta o FoodCache
│   │   │   └── user_service.py         # Metas, água, peso
│   │   ├── routes/
│   │   │   ├── auth_routes.py      # /api/auth — register, login, refresh, logout
│   │   │   ├── meals_routes.py     # /api/meals — analyze, save, favorites, insights...
│   │   │   └── user_routes.py      # /api/user — goals, water, weight
│   │   └── utils/
│   │       └── crypto.py           # Fernet — criptografia de dados sensíveis em repouso
│   ├── migrations/                 # Alembic (flask db migrate/upgrade)
│   ├── tests/                      # pytest — segurança de auth (hash, rate limit, tokens)
│   ├── scripts/                    # Utilitários fora do runtime da API
│   ├── instance/                   # nutrition.db (SQLite, criado em runtime, não versionado)
│   ├── run.py                      # Entry point
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                        # App Expo (React Native)
    ├── App.js                       # Carrega fontes (Orbitron) e monta o navigator
    ├── app.json                     # Config do Expo (nome, package Android/iOS)
    ├── eas.json                     # Build profiles (development/preview/production)
    ├── src/
    │   ├── navigation/
    │   │   ├── AppNavigator.js      # Stack de telas
    │   │   └── RootNavigation.js
    │   ├── screens/                 # Login, Register, Dashboard, Camera, ManualEntry,
    │   │                             # MealConfirmation, AdjustQuantity, Goals, Insights
    │   ├── components/
    │   │   ├── LogoMark.js          # Logo vetorial (react-native-svg)
    │   │   └── BackButton.js        # Botão de voltar padrão, usado em quase todas as telas
    │   └── services/
    │       ├── api.js               # Único ponto de contato com o backend
    │       └── openFoodFacts.js     # Lookup de produtos por código de barras (Open Food Facts)
    ├── tailwind.config.js
    └── package.json
```

## Por que essa separação (baixo acoplamento)

- **`gemini_service.py`** é o único arquivo que conhece o SDK do Gemini. Trocar de provider de IA
  no futuro (GPT-4 Vision, Claude Vision) significa mudar só esse arquivo.
- **`meal_service.py`** conecta IA e banco, mas não sabe nada sobre HTTP — reaproveitável em outro
  contexto (worker assíncrono, CLI de importação) sem depender do Flask.
- **`meals_routes.py`/`auth_routes.py`/`user_routes.py`** são finos: só traduzem HTTP em chamadas
  de serviço.
- O **prompt do Gemini é estrito** e força `response_mime_type: application/json`, eliminando
  parsing frágil de texto livre. Cada alimento de uma foto é identificado **separadamente** (nunca
  misturado), com sua própria estimativa de gramas — permitindo ajuste individual depois de salvo.
- **`food_cache_service.py`** garante que o mesmo alimento (ex: "banana") sempre use os mesmos
  macros de referência entre análises diferentes, em vez de variar levemente a cada chamada de IA.
- No frontend, **`api.js`** é o único ponto de contato com o backend — telas nunca fazem `fetch`
  diretamente.

## Segurança

- Senhas com hash (nunca texto puro) via Werkzeug.
- Tokens JWT de acesso (1h) e refresh (7 dias), com blocklist de revogação no logout.
- Rate limiting (5 req/min) em `/login` e `/register` contra força bruta.
- `SECRET_KEY`/`JWT_SECRET_KEY` sem fallback inseguro — o serviço falha ao subir se não
  estiverem definidos no `.env` (fail fast em produção).
- CORS restrito por variável de ambiente (`CORS_ORIGINS`).
- Utilitário de criptografia (Fernet) preparado para dados de saúde sensíveis.
- Suite de testes (`backend/tests/`, pytest) cobrindo autenticação (hash, rate limiting,
  revogação de tokens), invariantes de negócio (refeições, favoritos, metas), performance
  de consultas (N+1, índices, paginação) e integração com o Gemini (parsing de resposta,
  tratamento de erro, cache de custo/quota).

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

### Rodando os testes

```bash
cd backend
venv\Scripts\pytest -v
```

Os testes rodam contra um SQLite em memória (`TestConfig`), isolado do banco de desenvolvimento.

## Rodando o frontend

O projeto usa **Expo Dev Client** (não Expo Go) — necessário porque o app usa módulos nativos
(câmera, ícones vetoriais, fontes customizadas) que exigem um build nativo próprio.

```bash
cd frontend
npm install
copy .env.example .env           # ajuste EXPO_PUBLIC_API_URL pro seu ambiente
```

**Emulador Android:** use `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api` no `.env` — `10.0.2.2` é
o endereço fixo que o emulador usa para alcançar o `localhost` da máquina host, independente do
IP real da sua rede.

**Celular físico:** use o IP da sua máquina na rede local (ex: `http://192.168.0.20:5000/api`) —
celular e computador precisam estar na mesma rede Wi-Fi.

Primeira vez (gera o projeto nativo e instala no dispositivo/emulador conectado):

```bash
npx expo run:android
```

Nas próximas vezes, só é preciso subir o Metro (o app já está instalado):

```bash
npx expo start --dev-client --clear
```

## Próximos passos sugeridos

1. Wiring do `refresh_token` no frontend (já emitido pelo `/login`, ainda não usado pelo app).
2. Job periódico de limpeza da tabela `token_blocklist` (só cresce hoje).
3. Testes de rate limiting do `/register`, revogação de refresh token e do utilitário `crypto.py`.
4. Trocar SQLite por Postgres ao sair do estágio de MVP.
5. Fila assíncrona (Celery/RQ) se o volume de imagens crescer, para não bloquear a request HTTP
   na chamada ao Gemini.
6. Versionamento da API (`/api/v1/...`) para preparar integrações externas.
