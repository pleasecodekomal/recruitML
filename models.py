# models.py
from sqlalchemy import Column, Integer, String, Float, Text, JSON, DateTime
from datetime import datetime
from database import Base

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    predicted_role = Column(String, nullable=True)
    extracted_skills = Column(JSON, default=[])  # Saved as JSON list
    created_at = Column(DateTime, default=datetime.utcnow)

class ScreeningResult(Base):
    __tablename__ = "screening_results"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer)
    job_title = Column(String)
    match_score = Column(Float)
    matched_skills = Column(JSON, default=[])
    missing_skills = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)