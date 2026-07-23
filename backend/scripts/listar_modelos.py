import json
import os
from urllib.request import urlopen

from dotenv import load_dotenv

# Carrega o GEMINI_API_KEY do backend/.env (mesmo usado pelo app)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

CHAVE = os.getenv("GEMINI_API_KEY")
if not CHAVE:
    raise SystemExit("GEMINI_API_KEY não encontrada no backend/.env")

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={CHAVE}"

try:
    with urlopen(url) as response:
        dados = json.loads(response.read())
        print("Modelos que suportam geração de conteúdo na sua chave:\n")
        
        for modelo in dados.get("models", []):
            nome = modelo.get("name")
            metodos = modelo.get("supportedGenerationMethods", [])
            
            # Filtramos apenas os modelos que processam texto/imagem (generateContent)
            if "generateContent" in metodos and ("flash" in nome or "pro" in nome):
                print(f"✅ {nome.replace('models/', '')}")
                
except Exception as e:
    print(f"Erro ao consultar a API: {e}")