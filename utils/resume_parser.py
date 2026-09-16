import re
import json
import os
import pdfplumber
import spacy
from spacy.matcher import PhraseMatcher
from transformers import pipeline
from sentence_transformers import SentenceTransformer, util

# ==========================================
# 1. Initialize Models (Load once at startup)
# ==========================================

print("Loading spaCy NLP Model...")
nlp = spacy.load("en_core_web_sm")

print("Loading Hugging Face Resume NER Model...")
ner_pipeline = pipeline(
    "token-classification", 
    model="AventIQ-AI/Resume-Parsing-NER-AI-Model", 
    aggregation_strategy="simple"
)

print("Loading SentenceTransformer Embedding Model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

# Taxonomy DB of common skills (Expandable)
# In resume_parser.py
COMMON_SKILLS = [
    # Tech & Dev
    "Python", "Java", "C++", "SQL", "JavaScript", "HTML", "CSS", "React", "Node.js", 
    "Docker", "Kubernetes", "AWS", "Azure", "Machine Learning", "Data Science", 
    "Deep Learning", "Git", "FastAPI", "Flask", "Django", "Linux", "NLP", "Pandas", "NumPy",
    
    # HR & Management Skills
    "Recruitment", "Talent Acquisition", "Sourcing", "Employee Relations", "Onboarding", 
    "Performance Management", "HR Policies", "Payroll", "HRIS", "Labor Laws", "Negotiation",
    "Screening", "Interviewing", "Employee Engagement", "Human Resources", "Management"
]

# ==========================================
# 2. Extraction Helper Functions
# ==========================================

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract raw text from PDF resume using pdfplumber."""
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"Error reading PDF {pdf_path}: {e}")
    return text

def extract_text_from_file(file_path: str) -> str:
    """Generic text extractor handling both PDF and TXT documents gracefully."""
    ext = os.path.splitext(file_path)[1].lower()
    
    # 1. Handle Plain Text Files (.txt)
    if ext in ['.txt', '.text', '.md', '.log']:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except UnicodeDecodeError:
            with open(file_path, 'r', encoding='latin-1', errors='ignore') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading text file {file_path}: {e}")
            return ""

    # 2. Handle PDF Files (.pdf)
    return extract_text_from_pdf(file_path)

def extract_candidate_name(text: str, filename: str = "", ai_entities: dict = None) -> str:
    """Multi-stage candidate name extraction pipeline."""
    
    # 1. Check Hugging Face / spaCy AI NER output first
    if ai_entities:
        for key in ['PERSON', 'Name', 'PER', 'Candidate_Name']:
            if key in ai_entities and ai_entities[key]:
                candidate_name = ai_entities[key][0].strip()
                # Ensure it looks like a clean name (no digits or symbols)
                if len(candidate_name.split()) <= 4 and not re.search(r'\d', candidate_name):
                    return candidate_name.title()

    # 2. Heuristic Scan: Examine the first few non-empty lines
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    ignore_keywords = ['resume', 'curriculum', 'vitae', 'cv', 'contact', 'profile', 'page', 'summary', 'education', 'skills']

    for line in lines[:8]:
        # Skip lines containing emails, URLs, or phone numbers
        if re.search(r'@|http|www|\+|\d{5,}', line, re.IGNORECASE):
            continue
        
        # Skip common header labels
        if any(keyword in line.lower() for keyword in ignore_keywords):
            continue

        # Valid candidate names usually consist of 2 to 4 words (letters only)
        clean_line = re.sub(r'[^a-zA-Z\s]', '', line).strip()
        words = clean_line.split()

        if 2 <= len(words) <= 4 and all(len(w) >= 2 for w in words):
            return clean_line.title()

    # 3. Fallback: Parse name from email local-part if clean (e.g., sabalekomal45 -> Komal Sabale)
    email_match = re.search(r'([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    if email_match:
        local_part = email_match.group(1)
        # Strip digits & special characters
        clean_email_name = re.sub(r'[\d._%+--]', ' ', local_part).strip()
        words = clean_email_name.split()
        if len(words) >= 1 and len(clean_email_name) >= 3:
            return clean_email_name.title()

    # 4. Final Fallback: Extract clean name from Filename
    if filename:
        clean_filename = os.path.splitext(filename)[0]
        clean_filename = re.sub(r'(?i)resume|cv|pdf|doc|docx', '', clean_filename)
        clean_filename = re.sub(r'[^a-zA-Z\s]', ' ', clean_filename).strip()
        if len(clean_filename.split()) >= 1:
            return clean_filename.title()

    return "N/A"

def extract_regex_info(text: str, filename: str = "", ai_entities: dict = None) -> dict:
    """Extract candidate name, email, and phone number accurately."""
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    phone_pattern = r'\(?\+?\d{1,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}'
    
    email = re.findall(email_pattern, text)
    phone = re.findall(phone_pattern, text)
    
    # Extract candidate name using the multi-tier strategy
    name = extract_candidate_name(text, filename=filename, ai_entities=ai_entities)
    
    return {
        "name": name,
        "email": email[0] if email else "N/A",
        "phone": phone[0] if phone else "N/A"
    }

def extract_skills(text: str, skills_list: list) -> list:
    """Exact & Case-Insensitive Phrase Matching for skills using spaCy."""
    doc = nlp(text.lower())
    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
    
    patterns = [nlp.make_doc(skill.lower()) for skill in skills_list]
    matcher.add("SKILL_PATTERN", patterns)
    
    matches = matcher(doc)
    extracted_skills = set()
    
    for match_id, start, end in matches:
        span = doc[start:end]
        # Preserve original casing from skills taxonomy
        matched_str = span.text.lower()
        for original_skill in skills_list:
            if original_skill.lower() == matched_str:
                extracted_skills.add(original_skill)
                break
        
    return list(extracted_skills)

def extract_experience_years(text: str) -> float:
    """Extract candidate total years of experience using RegEx patterns."""
    patterns = [
        r'(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s*(?:of)?\s*experience',
        r'experience\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)',
        r'(\d+)\s*\+\s*years?'
    ]
    matches = []
    for pattern in patterns:
        found = re.findall(pattern, text, re.IGNORECASE)
        for f in found:
            try:
                if isinstance(f, tuple):
                    for val in f:
                        if val: matches.append(float(val))
                else:
                    matches.append(float(f))
            except ValueError:
                pass
    
    return max(matches) if matches else 0.0

def extract_education(text: str) -> list:
    """Extract education qualifications from resume text."""
    degree_patterns = [
        r'\b(?:B\.?E\.?|B\.?Tech|Bachelor of Technology|Bachelor of Engineering)\b',
        r'\b(?:M\.?E\.?|M\.?Tech|Master of Technology|Master of Engineering)\b',
        r'\b(?:B\.?Sc|BCA|Bachelor of Science|Bachelor of Computer Applications)\b',
        r'\b(?:M\.?Sc|MCA|Master of Science|Master of Computer Applications)\b',
        r'\b(?:Ph\.?D|Doctorate)\b',
        r'\b(?:Bachelor|Master|Diploma)\s+in\s+[A-Za-z\s]+\b'
    ]
    degrees = set()
    for pattern in degree_patterns:
        found = re.findall(pattern, text, re.IGNORECASE)
        for f in found:
            degrees.add(f.strip())
            
    return list(degrees)

# ==========================================
# 3. Main Parsing Function
# ==========================================

def parse_resume(file_path: str) -> dict:
    """Extract structured data from PDF or TXT resume using Regex, spaCy, and Hugging Face."""
    text = extract_text_from_file(file_path)
    
    if not text.strip():
        return {"error": f"Could not extract text from {file_path}"}

    filename = os.path.basename(file_path)

    # 1. Process text through Hugging Face Token Classification (Truncated to 2500 chars)
    raw_entities = ner_pipeline(text[:2500])
    
    ai_entities = {}
    for entity in raw_entities:
        group = entity['entity_group']
        word = entity['word'].strip()
        
        if group not in ai_entities:
            ai_entities[group] = []
            
        if word and word not in ai_entities[group]:
            ai_entities[group].append(word)

    # 2. Extract deterministic contact info (Name, Email, Phone) passing filename & AI entities
    contact_info = extract_regex_info(text, filename=filename, ai_entities=ai_entities)

    # 3. Extract skills, experience, and education
    extracted_skills = extract_skills(text, COMMON_SKILLS)
    experience_years = extract_experience_years(text)
    education_degrees = extract_education(text)
        
    return {
        "contact_info": contact_info,
        "skills": extracted_skills,
        "experience_years": experience_years,
        "education": education_degrees,
        "ai_extracted_entities": ai_entities,
        "raw_text": text
    }

# ==========================================
# 4. Hybrid Match Scoring Engine
# ==========================================

def compute_match_score(resume_skills: list, resume_text: str, jd_text: str) -> dict:
    """
    Computes a hybrid match score combining:
    1. Exact Skill Overlap (40% Weight)
    2. Contextual Dense Vector Embeddings (60% Weight)
    """
    # Auto-extract required skills from the Job Description using the taxonomy
    jd_skills = extract_skills(jd_text, COMMON_SKILLS)

    # 1. Exact Skill Overlap
    cand_skills_lower = set(s.lower() for s in resume_skills)
    jd_skills_lower = set(s.lower() for s in jd_skills)
    
    matched_skills = cand_skills_lower.intersection(jd_skills_lower)
    missing_skills = jd_skills_lower - cand_skills_lower
    
    skill_score = (len(matched_skills) / len(jd_skills_lower) * 100) if jd_skills_lower else 50.0
    
    # 2. Semantic Similarity Score
    res_emb = embedding_model.encode(resume_text, convert_to_tensor=True)
    jd_emb = embedding_model.encode(jd_text, convert_to_tensor=True)
    semantic_score = float(util.cos_sim(res_emb, jd_emb)) * 100
    
    # Bound semantic score between 0 and 100
    semantic_score = max(0.0, min(100.0, semantic_score))

    # 3. Combined weighted score
    final_score = round((0.4 * skill_score) + (0.6 * semantic_score), 1)
    
    return {
        "final_score": final_score,
        "semantic_score": round(semantic_score, 1),
        "skill_match_score": round(skill_score, 1),
        "matched_skills": [s.title() for s in matched_skills],
        "missing_skills": [s.title() for s in missing_skills]
    }

# ==========================================
# 5. Local Sandbox Testing
# ==========================================
if __name__ == "__main__":
    sample_jd = """
    We are looking for a Senior Python Developer with expertise in FastAPI, SQL, 
    and Docker. Experience with Machine Learning and Cloud infrastructure (AWS or Azure) is a plus.
    """
    
    sample_resume_skills = ["Python", "SQL", "Flask", "HTML", "CSS"]
    sample_resume_text = "Experienced software developer skilled in Python, SQL, and web backend development using Flask."

    res = compute_match_score(sample_resume_skills, sample_resume_text, sample_jd)
    print("Match Score Analysis:\n", json.dumps(res, indent=2))

    # Add this role taxonomy at the bottom of resume_parser.py

ROLE_TAXONOMY = {
    "Python Developer": {
        "core_skills": ["Python", "FastAPI", "Django", "SQL", "Git"],
        "recommended_learning": "Focus on backend architecture, API optimization with FastAPI/Django, and SQL query tuning."
    },
    "Data Scientist / ML Engineer": {
        "core_skills": ["Python", "Machine Learning", "Deep Learning", "Pandas", "NumPy", "SQL", "NLP"],
        "recommended_learning": "Master PyTorch/TensorFlow, model deployment, vector databases, and MLOps frameworks."
    },
    "DevOps / Cloud Engineer": {
        "core_skills": ["Docker", "Kubernetes", "AWS", "Azure", "Linux", "Git"],
        "recommended_learning": "Build CI/CD pipelines, practice Infrastructure-as-Code (Terraform), and study Kubernetes administration."
    },
    "Frontend Developer": {
        "core_skills": ["JavaScript", "React", "HTML", "CSS", "Git"],
        "recommended_learning": "Strengthen TypeScript, Next.js, state management (Redux/Zustand), and responsive web design."
    },
    "Full Stack Engineer": {
        "core_skills": ["JavaScript", "React", "Node.js", "Python", "SQL", "Docker", "Git"],
        "recommended_learning": "Learn microservice communication, database ORMs, and containerized cloud deployment."
    }
}

def generate_role_justification(predicted_role: str, extracted_skills: list, experience_years: float) -> str:
    """Generates a recruiter/candidate readable explanation for why an ML model chose a role."""
    role_info = ROLE_TAXONOMY.get(predicted_role, None)
    if not role_info:
        return f"Predicted Role: {predicted_role}. Based on overall technical keywords and work history detected in the resume text."

    core_reqs = set(s.lower() for s in role_info["core_skills"])
    cand_skills = set(s.lower() for s in extracted_skills)
    matched = cand_skills.intersection(core_reqs)
    
    match_pct = round((len(matched) / len(core_reqs)) * 100) if core_reqs else 50

    matched_str = ", ".join(s.title() for s in matched) if matched else "general technical terms"
    return (
        f"Predicted Role: {predicted_role}. "
        f"Rationale: Candidate possesses key competencies in [{matched_str}], representing approximately {match_pct}% "
        f"of core requirements for this specialization with {experience_years} years of demonstrated experience."
    )

def perform_dream_job_gap_analysis(extracted_skills: list, target_roles: list) -> list:
    """Computes a Skill Gap Matrix and recommended learning path for target dream jobs."""
    cand_skills_lower = set(s.lower() for s in extracted_skills)
    gap_results = []

    for target in target_roles:
        target_clean = target.strip()
        role_profile = ROLE_TAXONOMY.get(target_clean, None)

        if not role_profile:
            # Fallback if dream job is custom/not in pre-defined taxonomy
            gap_results.append({
                "dream_job": target_clean,
                "match_percentage": 50.0,
                "matched_skills": [s.title() for s in extracted_skills[:3]],
                "missing_skills": ["Specialized " + target_clean + " Frameworks"],
                "recommendation": f"Custom role profile: Explore industry certifications and projects related to {target_clean}."
            })
            continue

        required_skills = set(s.lower() for s in role_profile["core_skills"])
        matched = cand_skills_lower.intersection(required_skills)
        missing = required_skills - cand_skills_lower

        match_pct = round((len(matched) / len(required_skills)) * 100, 1) if required_skills else 0.0

        gap_results.append({
            "dream_job": target_clean,
            "match_percentage": match_pct,
            "matched_skills": [s.title() for s in matched],
            "missing_skills": [s.title() for s in missing],
            "recommendation": role_profile["recommended_learning"]
        })

    return gap_results

    # Add this function at the bottom of utils/resume_parser.py

def compute_weighted_match_score(
    resume_skills: list, 
    resume_text: str, 
    jd_text: str, 
    skill_weights: dict = None
) -> dict:
    """
    Computes hybrid match score along with a skill-weighted degree score and NL summary verdict.
    """
    jd_skills = extract_skills(jd_text, COMMON_SKILLS)
    cand_skills_lower = set(s.lower() for s in resume_skills)
    jd_skills_lower = set(s.lower() for s in jd_skills)

    matched_skills = cand_skills_lower.intersection(jd_skills_lower)
    missing_skills = jd_skills_lower - cand_skills_lower

    # 1. Standard Skill Score (Unweighted)
    standard_skill_score = (len(matched_skills) / len(jd_skills_lower) * 100) if jd_skills_lower else 50.0

    # 2. Weighted Degree Skill Score
    weighted_skill_score = standard_skill_score
    if skill_weights and jd_skills_lower:
        total_weight = 0
        achieved_weight = 0
        for skill in jd_skills_lower:
            # find original skill casing
            orig_name = next((s for s in jd_skills if s.lower() == skill), skill.title())
            weight = skill_weights.get(orig_name, 100)
            total_weight += weight
            if skill in cand_skills_lower:
                achieved_weight += weight
        
        if total_weight > 0:
            weighted_skill_score = (achieved_weight / total_weight) * 100

    # 3. Semantic Cosine Similarity Score
    res_emb = embedding_model.encode(resume_text, convert_to_tensor=True)
    jd_emb = embedding_model.encode(jd_text, convert_to_tensor=True)
    semantic_score = float(util.cos_sim(res_emb, jd_emb)) * 100
    semantic_score = max(0.0, min(100.0, semantic_score))

    # 4. Final Combined Scores
    unweighted_final = round((0.4 * standard_skill_score) + (0.6 * semantic_score), 1)
    weighted_final = round((0.4 * weighted_skill_score) + (0.6 * semantic_score), 1)

    # 5. Verdict & Natural Language Rationale Generation
    verdict = "NOT A MATCH"
    if weighted_final >= 75.0:
        verdict = "STRONG MATCH"
    elif weighted_final >= 50.0:
        verdict = "SLIGHT MATCH"

    heavy_matched = []
    heavy_missing = []
    if skill_weights:
        for orig_skill, w in skill_weights.items():
            if w >= 70:
                if orig_skill.lower() in cand_skills_lower:
                    heavy_matched.append(f"{orig_skill} ({w}% degree)")
                else:
                    heavy_missing.append(f"{orig_skill} ({w}% degree)")

    nl_summary_parts = [f"Candidate is a {verdict} with an overall score of {weighted_final}%."]
    if heavy_matched:
        nl_summary_parts.append(f"Strong alignment on critical high-degree skill(s): {', '.join(heavy_matched)}.")
    if heavy_missing:
        nl_summary_parts.append(f"Lacks high-degree requirement(s): {', '.join(heavy_missing)}.")
    elif missing_skills:
        nl_summary_parts.append(f"Missing general skill(s): {', '.join(s.title() for s in missing_skills)}.")

    nl_summary = " ".join(nl_summary_parts)

    return {
        "verdict": verdict,
        "final_score": unweighted_final,
        "weighted_match_score": weighted_final,
        "semantic_score": round(semantic_score, 1),
        "skill_match_score": round(weighted_skill_score, 1),
        "matched_skills": [s.title() for s in matched_skills],
        "missing_skills": [s.title() for s in missing_skills],
        "nl_summary": nl_summary
    }