import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)

print("=== Models supporting generateContent (LLM text generation) ===")
for m in client.models.list():
    if hasattr(m, 'supported_actions') and "generateContent" in m.supported_actions:
        print(f"- {m.name}")

print("\n=== Models supporting embedContent (Embeddings for RAG) ===")
for m in client.models.list():
    if hasattr(m, 'supported_actions') and "embedContent" in m.supported_actions:
        print(f"- {m.name}")