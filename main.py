import os
import re
import pickle
import fitz  # PyMuPDF
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Float, JSON, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Import our advanced NER parser and hybrid matcher
from utils.resume_parser import parse_resume, compute_match_score
# Add this import at the top of main.py
from rag_engine import query_resume_rag

# Add this Pydantic schema for structured request body
from pydantic import BaseModel
import os
import re
import json
import hashlib
import pickle
import fitz  # PyMuPDF
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Float, JSON, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Import our advanced NER parser and hybrid matcher
from utils.resume_parser import parse_resume, compute_match_score
from rag_engine import query_resume_rag
from pydantic import BaseModel

from pydantic import BaseModel
from typing import List

import spacy
# Disable heavy components to save ~150MB RAM
nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])
import torch

with torch.inference_mode():
    embeddings = model.encode(texts)
# Add the new imports to your existing utils.resume_parser import line
from utils.resume_parser import (
    parse_resume, compute_match_score, 
    generate_role_justification, perform_dream_job_gap_analysis, ROLE_TAXONOMY
)
# ==========================================
# 1. DATABASE SETUP (SQLite)
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./recruitml.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class CandidateDB(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    name = Column(String, default="N/A")
    email = Column(String, default="N/A")
    phone = Column(String, default="N/A")
    predicted_role = Column(String, default="N/A")
    extracted_skills = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# 2. LOAD ML CLASSIFICATION MODEL & UTILS
# ==========================================
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'pdf', 'txt'}

model, tfidf, label_encoder = None, None, None

try:
    with open("classifier_model.pkl", "rb") as f:
        model = pickle.load(f)
    with open("vectorizer.pkl", "rb") as f:
        tfidf = pickle.load(f)
    with open("label_encoder.pkl", "rb") as f:
        label_encoder = pickle.load(f)
    print("✅ ML Role Classifier loaded successfully.")
except Exception as e:
    print(f"⚠️ Warning: Could not load ML models. Ensure .pkl files exist. Error: {e}")

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def clean_text_for_classifier(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# ==========================================
# 3. FASTAPI APP INIT & CORS
# ==========================================
app = FastAPI(title="RecruitML Engine API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust during production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 4. API ENDPOINTS
# ==========================================

@app.post("/api/v1/predict")
async def analyze_single_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload single resume, extract skills/contact info via NER parser, predict role, and save to SQLite & JSON registry."""
    if not allowed_file(file.filename):
        raise HTTPException(status_code=400, detail="Invalid file format. Allowed formats: PDF, TXT")

    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    # 1. Parse entities using the advanced Transformer + spaCy parser
    parsed_data = parse_resume(filepath)
    if "error" in parsed_data:
        raise HTTPException(status_code=500, detail=parsed_data["error"])

    raw_text = parsed_data.get("raw_text", "")
    extracted_skills = parsed_data.get("skills", [])
    contact_info = parsed_data.get("contact_info", {})
    exp_years = parsed_data.get("experience_years", 0.0)  # <-- Added Experience Years

    cand_name = contact_info.get("name", "N/A")
    cand_email = contact_info.get("email", "N/A")
    cand_phone = contact_info.get("phone", "N/A")

    # Save/Update JSON Registry in database/
    candidate_id = save_candidate_to_json(cand_name, cand_email, cand_phone, file.filename)

    # 2. Predict Role using saved Scikit-Learn ML Model
    predicted_role = "Unknown"
    if model and tfidf and label_encoder and raw_text:
        try:
            cleaned = clean_text_for_classifier(raw_text)
            vector = tfidf.transform([cleaned])
            prediction = model.predict(vector)
            predicted_role = label_encoder.inverse_transform(prediction)[0]
        except Exception as e:
            print(f"Error making ML role prediction: {e}")

    # <-- NEW: Generate Natural Language Role Justification -->
    role_justification = generate_role_justification(predicted_role, extracted_skills, exp_years)

    # 3. Save candidate entry to database
    candidate = CandidateDB(
        filename=file.filename,
        name=cand_name,
        email=cand_email,
        phone=cand_phone,
        predicted_role=predicted_role,
        extracted_skills=extracted_skills
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return {
        "success": True,
        "id": candidate.id,
        "candidate_id": candidate_id,
        "filename": file.filename,
        "predicted_role": predicted_role,
        "role_justification": role_justification,             # <-- Added Justification
        "available_dream_jobs": list(ROLE_TAXONOMY.keys()),   # <-- Added Taxonomy list
        "parsed_info": {
            "name": candidate.name,
            "email": candidate.email,
            "phone": candidate.phone,
            "skills": extracted_skills,
            "experience_years": exp_years                     # <-- Added Experience
        },
        "raw_text": raw_text,  # Important: Included so React's RAG feature doesn't fail
        "raw_text_preview": raw_text[:300]
    }


# ==========================================
# NEW: Dream Job Gap Analysis Endpoint
# ==========================================
class DreamJobRequest(BaseModel):
    extracted_skills: List[str]
    target_roles: List[str]

@app.post("/api/v1/dream-job-gap")
async def analyze_dream_job_gap(payload: DreamJobRequest):
    """Computes skill gaps and learning advice for selected target roles."""
    if not payload.target_roles:
        raise HTTPException(status_code=400, detail="Please select at least one target dream job.")

    results = perform_dream_job_gap_analysis(payload.extracted_skills, payload.target_roles)
    return {"success": True, "gap_matrix": results}

@app.post("/api/v1/screener")
async def screen_batch_resumes(
    job_description: str = Form(...),
    resumes: List[UploadFile] = File(...)
):
    """Batch screen multiple resumes and update candidate database registry."""
    results = []

    for file in resumes:
        if allowed_file(file.filename):
            filepath = os.path.join(UPLOAD_FOLDER, file.filename)
            with open(filepath, "wb") as f:
                f.write(await file.read())

            parsed_data = parse_resume(filepath)
            resume_skills = parsed_data.get("skills", [])
            resume_text = parsed_data.get("raw_text", "")
            contact_info = parsed_data.get("contact_info", {})

            # Predict role using saved model
            predicted_role = "Unknown"
            if model and tfidf and label_encoder and resume_text:
                try:
                    cleaned = clean_text_for_classifier(resume_text)
                    vector = tfidf.transform([cleaned])
                    prediction = model.predict(vector)
                    predicted_role = label_encoder.inverse_transform(prediction)[0]
                except Exception as e:
                    print(f"Error predicting role: {e}")

            # Save to JSON registry
            candidate_id = save_candidate_to_json(
                contact_info.get("name", "N/A"),
                contact_info.get("email", "N/A"),
                contact_info.get("phone", "N/A"),
                file.filename
            )

            match_data = compute_match_score(resume_skills, resume_text, job_description)

            results.append({
                "candidate_id": candidate_id,
                "filename": file.filename,
                "match_score": match_data["final_score"],
                "semantic_score": match_data["semantic_score"],
                "skill_match_score": match_data["skill_match_score"],
                "matched_skills": match_data["matched_skills"],
                "missing_skills": match_data["missing_skills"],
                # Return parsed data & raw text for inline analysis
                "raw_text": resume_text,
                "predicted_role": predicted_role,
                "parsed_info": {
                    "name": contact_info.get("name", "N/A"),
                    "email": contact_info.get("email", "N/A"),
                    "phone": contact_info.get("phone", "N/A"),
                    "skills": resume_skills
                }
            })

    if not results:
        raise HTTPException(status_code=400, detail="No valid resume files uploaded or processed.")

    # Sort candidates by overall match score from highest to lowest
    results.sort(key=lambda x: x["match_score"], reverse=True)

    return {
        "success": True,
        "total_screened": len(results),
        "results": results
    }
@app.get("/api/v1/candidates")
def get_all_candidates(db: Session = Depends(get_db)):
    """Fetch stored candidate profiles from SQLite local database."""
    candidates = db.query(CandidateDB).all()
    return {"candidates": candidates}



class ChatResumeRequest(BaseModel):
    resume_text: str
    question: str
    anonymize: bool = False

@app.post("/api/v1/chat-resume")
async def chat_with_candidate_resume(payload: ChatResumeRequest):
    """
    RAG Endpoint: Allows recruiters to ask natural language questions about a candidate's resume.
    """
    if not payload.resume_text or not payload.question:
        raise HTTPException(status_code=400, detail="Both resume_text and question are required.")

    # Pass anonymize flag into RAG function
    answer = query_resume_rag(payload.resume_text, payload.question, anonymize=payload.anonymize)
    
    return {
        "success": True,
        "question": payload.question,
        "answer": answer
    }

# ==========================================
# JSON REGISTRY & CANDIDATE DATABASE LOGIC
# ==========================================
DATABASE_FOLDER = "database"
os.makedirs(DATABASE_FOLDER, exist_ok=True)
JSON_DB_PATH = os.path.join(DATABASE_FOLDER, "candidate_registry.json")

def generate_candidate_id(filename: str, email: str = "") -> str:
    """Generates a short, consistent unique ID based on candidate credentials."""
    unique_string = f"{email.lower().strip() if email != 'N/A' else filename.lower().strip()}"
    short_hash = hashlib.md5(unique_string.encode('utf-8')).hexdigest()[:6].upper()
    return f"CAN-{short_hash}"

def save_candidate_to_json(name: str, email: str, phone: str, filename: str) -> str:
    """
    Saves/updates candidate entry in database/candidate_registry.json.
    Tracks duplicate submissions by incrementing an appearance count variable.
    Returns the unique candidate ID.
    """
    candidate_id = generate_candidate_id(filename, email)

    # Load existing JSON database or initialize empty dict
    registry = {}
    if os.path.exists(JSON_DB_PATH):
        try:
            with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
                registry = json.load(f)
        except Exception as e:
            print(f"Error loading JSON registry: {e}")
            registry = {}

    # Check for duplicate entry
    if candidate_id in registry:
        registry[candidate_id]["appearances"] += 1
        registry[candidate_id]["last_seen"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    else:
        registry[candidate_id] = {
            "candidate_id": candidate_id,
            "filename": filename,
            "name": name if name else "N/A",
            "email": email if email else "N/A",
            "phone": phone if phone else "N/A",
            "appearances": 1,
            "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "last_seen": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        }

    # Save back to database/candidate_registry.json
    try:
        with open(JSON_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(registry, f, indent=2)
    except Exception as e:
        print(f"Error saving to JSON registry: {e}")

    return candidate_id

# In main.py, update the import line from utils.resume_parser:
from utils.resume_parser import (
    parse_resume, compute_match_score, compute_weighted_match_score,
    generate_role_justification, perform_dream_job_gap_analysis, 
    extract_skills, COMMON_SKILLS, ROLE_TAXONOMY
)

# 1. NEW: Extract skills from pasted JD so recruiters can set weights
class JDSkillExtractionRequest(BaseModel):
    jd_text: str

@app.post("/api/v1/extract-jd-skills")
async def extract_jd_skills(payload: JDSkillExtractionRequest):
    if not payload.jd_text.strip():
        return {"skills": []}
    skills = extract_skills(payload.jd_text, COMMON_SKILLS)
    return {"skills": [s.title() for s in skills]}

# 2. UPDATED: Screener accepting optional skill weights
@app.post("/api/v1/screener")
async def screen_batch_resumes(
    job_description: str = Form(...),
    resumes: List[UploadFile] = File(...),
    skill_weights_json: Optional[str] = Form(None)
):
    """Batch screen multiple resumes with optional skill degree weighting."""
    skill_weights = {}
    if skill_weights_json:
        try:
            skill_weights = json.loads(skill_weights_json)
        except Exception as e:
            print(f"Error parsing skill weights JSON: {e}")

    results = []

    for file in resumes:
        if allowed_file(file.filename):
            filepath = os.path.join(UPLOAD_FOLDER, file.filename)
            with open(filepath, "wb") as f:
                f.write(await file.read())

            parsed_data = parse_resume(filepath)
            resume_skills = parsed_data.get("skills", [])
            resume_text = parsed_data.get("raw_text", "")
            contact_info = parsed_data.get("contact_info", {})

            # Predict role
            predicted_role = "Unknown"
            if model and tfidf and label_encoder and resume_text:
                try:
                    cleaned = clean_text_for_classifier(resume_text)
                    vector = tfidf.transform([cleaned])
                    prediction = model.predict(vector)
                    predicted_role = label_encoder.inverse_transform(prediction)[0]
                except Exception as e:
                    print(f"Error predicting role: {e}")

            # Save to JSON registry
            candidate_id = save_candidate_to_json(
                contact_info.get("name", "N/A"),
                contact_info.get("email", "N/A"),
                contact_info.get("phone", "N/A"),
                file.filename
            )

            # Compute weighted match data
            match_data = compute_weighted_match_score(
                resume_skills, resume_text, job_description, skill_weights
            )

            results.append({
                "candidate_id": candidate_id,
                "filename": file.filename,
                "verdict": match_data["verdict"],
                "match_score": match_data["weighted_match_score"],
                "unweighted_score": match_data["final_score"],
                "semantic_score": match_data["semantic_score"],
                "skill_match_score": match_data["skill_match_score"],
                "matched_skills": match_data["matched_skills"],
                "missing_skills": match_data["missing_skills"],
                "nl_summary": match_data["nl_summary"],
                "raw_text": resume_text,
                "predicted_role": predicted_role,
                "parsed_info": {
                    "name": contact_info.get("name", "N/A"),
                    "email": contact_info.get("email", "N/A"),
                    "phone": contact_info.get("phone", "N/A"),
                    "skills": resume_skills
                }
            })

    if not results:
        raise HTTPException(status_code=400, detail="No valid resume files uploaded or processed.")

    results.sort(key=lambda x: x["match_score"], reverse=True)

    return {
        "success": True,
        "total_screened": len(results),
        "results": results
    }

# 3. NEW: Email Dispatch Endpoint
class EmailDispatchPayload(BaseModel):
    recipients: List[dict]  # list of { candidate_id, name, email, decision }
    email_type: str        # 'acceptance' or 'rejection'
    custom_subject: str
    custom_body: str

@app.post("/api/v1/send-emails")
async def send_candidate_emails(payload: EmailDispatchPayload):
    """Simulates sending customized acceptance or rejection emails to selected candidates."""
    sent_log = []
    for cand in payload.recipients:
        # Fill placeholders
        body = payload.custom_body.replace("{candidate_name}", cand.get("name", "Candidate"))
        body = body.replace("{candidate_id}", cand.get("candidate_id", ""))
        
        sent_log.append({
            "candidate_id": cand.get("candidate_id"),
            "email": cand.get("email"),
            "status": "SENT",
            "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        })

    return {
        "success": True,
        "email_type": payload.email_type,
        "total_sent": len(sent_log),
        "dispatch_log": sent_log
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=5000, reload=True)