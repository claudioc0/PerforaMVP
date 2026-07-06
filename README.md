# Nutrition MVP — Microserviço de Análise de Refeições

## Arquitetura geral

O sistema é dividido em dois projetos independentes, sem acoplamento direto de código:

```
nutrition-app/
├── backend/                     # Microserviço Flask (Nutrition Analysis Service)
│   ├── app/
│   │   ├── __init__.py          # Application factory (create_app)
│   │   ├── config.py            # Configuração central (env vars)
│   │   ├── extensions.py        # Instâncias compartilhadas (db, cors)
│   │   ├── models/
│   │   │   └── meal.py          # Modelo SQLAlchemy: Meal
│   │   ├── services/
│   │   │   ├── gemini_service.py   # Toda a integração com Google Gemini
│   │   │   └── meal_service.py     # Orquestra IA + persistência (regra de negócio)
│   │   └── routes/
│   │       └── meals_routes.py  # Camada HTTP (Blueprint /api/meals)
│   ├── instance/                # nutrition.db (SQLite, criado em runtime)
│   ├── run.py                   # Entry point
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                    # App Expo (React Native)
    ├── App.js
    ├── src/
    │   ├── navigation/
    │   │   └── AppNavigator.js
    │   ├── screens/
    │   │   ├── DashboardScreen.js
    │   │   └── CameraScreen.js
    │   ├── components/
    │   │   └── MacroProgressBar.js
    │   └── services/
    │       └── api.js           # Única camada que fala com o backend
    ├── tailwind.config.js
    ├── global.css
    └── package.json
```

## Por que essa separação (baixo acoplamento)

- **`gemini_service.py`** é o único arquivo que conhece o SDK do Gemini. Se amanhã você trocar
  para GPT-4 Vision, Claude Vision, ou outro provider, só esse arquivo muda — rotas e modelos
  continuam intactos.
- **`meal_service.py`** é a camada de aplicação: conecta IA e banco, mas não sabe nada sobre HTTP.
  Isso permite reaproveitar essa lógica em outro contexto (ex: um worker assíncrono, um CLI de
  importação em lote) sem depender do Flask.
- **`meals_routes.py`** é fino: só traduz HTTP em chamadas de serviço. Fácil de testar e de expor
  como uma API RESTful padrão para integrações futuras (ex: um app de terceiros consumindo o
  mesmo microserviço).
- O **prompt do Gemini é estrito** e força `response_mime_type: application/json`, eliminando a
  necessidade de parsing frágil de texto livre.
- No frontend, **`api.js`** é o único ponto de contato com o backend — telas nunca fazem `fetch`
  diretamente, o que facilita trocar a URL base, adicionar autenticação, ou até trocar todo o
  backend no futuro.

## Setup — Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edite o .env e cole sua GEMINI_API_KEY (https://aistudio.google.com/app/apikey)

python run.py
# Servidor sobe em http://0.0.0.0:5000
```

Testando rapidamente com curl:

```bash
# Análise por imagem
curl -X POST http://localhost:5000/api/meals/analyze \
  -F "image=@/caminho/para/prato.jpg"

# Análise por texto (fallback)
curl -X POST http://localhost:5000/api/meals/analyze \
  -H "Content-Type: application/json" \
  -d '{"description": "200g de arroz, 100g de feijão e 150g de frango grelhado"}'

# Resumo do dia
curl http://localhost:5000/api/meals/today
```

## Setup — Frontend

```bash
cd frontend
npx create-expo-app . --template blank   # se ainda não inicializou o projeto Expo
npm install
npx expo install expo-camera

npx tailwindcss init   # se tailwind.config.js não existir ainda
```

Em `src/services/api.js`, ajuste `API_BASE_URL` para o IP da sua máquina na rede local
(não use `localhost` ao testar em dispositivo físico ou emulador Android — no Android
emulator use `10.0.2.2`).

```bash
npx expo start
```

## Próximos passos sugeridos (pós-MVP)

1. Autenticação (JWT) para suportar múltiplos usuários.
2. Trocar SQLite por Postgres quando sair do MVP.
3. Endpoint `DELETE /api/meals/<id>` e edição manual de macros (correção humana da IA).
4. Fila assíncrona (Celery/RQ) se o volume de imagens crescer, para não bloquear a request HTTP
   na chamada ao Gemini.
5. Versionamento da API (`/api/v1/...`) para preparar integrações externas mencionadas no
   objetivo do projeto.
