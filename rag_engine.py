import os
import re
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Load environment variables automatically
load_dotenv()

def sanitize_pii(text: str) -> str:
    """Removes emails, phone numbers, and URLs from raw text for bias reduction."""
    # Redact Emails
    text = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[REDACTED_EMAIL]', text)
    # Redact Phone Numbers
    text = re.sub(r'\(?\+?\d{1,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}', '[REDACTED_PHONE]', text)
    # Redact Web Links / LinkedIn
    text = re.sub(r'https?://\S+|www\.\S+', '[REDACTED_URL]', text)
    return text

def query_resume_rag(resume_text: str, user_question: str, anonymize: bool = False) -> str:
    """
    In-memory RAG pipeline using OpenRouter (Free LLM) & HuggingFace (Local Embeddings).
    """
    if not resume_text or not resume_text.strip():
        return "The resume text is empty or unreadable."

    openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_api_key:
        return "Error: OPENROUTER_API_KEY environment variable is not set in .env."

    # Apply PII sanitization if anonymization is turned ON
    processed_text = sanitize_pii(resume_text) if anonymize else resume_text

    try:
        # 1. Chunk the resume text
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        docs = text_splitter.create_documents([processed_text])

        # 2. Local Hugging Face Embeddings
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vectorstore = FAISS.from_documents(docs, embeddings)
        retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

        # 3. Define Prompt Template
        anonymize_instruction = ""
        if anonymize:
            anonymize_instruction = "\nBIAS REDUCTION MODE IS ON: Do NOT reveal or attempt to guess the candidate's real name, email, or contact info. If asked, respond with '[Redacted in Bias Reduction Mode]'."

        template = f"""You are an expert recruitment AI assistant.{anonymize_instruction}
Answer the user's question about the candidate based ONLY on the following resume context.
If the information is not explicitly present, state "Information not found in resume."

Context:
{{context}}

Question: {{question}}
Answer:"""

        prompt = ChatPromptTemplate.from_template(template)

        # 4. Initialize OpenRouter Chat Model
        llm = ChatOpenAI(
            model="openrouter/free",
            openai_api_key=openrouter_api_key,
            openai_api_base="https://openrouter.ai/api/v1",
            temperature=0.2
        )

        def format_docs(retrieved_docs):
            return "\n\n".join(doc.page_content for doc in retrieved_docs)

        # 5. Build LCEL RAG Chain
        rag_chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
        )

        # 6. Run query
        response = rag_chain.invoke(user_question)
        return response

    except Exception as e:
        return f"OpenRouter RAG Processing Error: {str(e)}"