from app import create_app

app = create_app()

if __name__ == "__main__":
    # host 0.0.0.0 para o app Expo (rodando no celular/emulador) conseguir acessar
    # debug vem do config (FLASK_ENV=development no .env) — nunca fixo em True
    app.run(host="0.0.0.0", port=5000, debug=app.config["DEBUG"])
