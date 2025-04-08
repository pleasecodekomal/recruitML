from flask import Flask, request, render_template, jsonify
import pickle
import os
import re
import fitz  # PyMuPDF
from werkzeug.utils import secure_filename
from sklearn.metrics.pairwise import cosine_similarity

# --- Flask Setup ---
app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf', 'txt'}

# --- Load Model and Preprocessing Tools ---
with open("classifier_model.pkl", "rb") as f:
    model = pickle.load(f)
with open("vectorizer.pkl", "rb") as f:
    tfidf = pickle.load(f)
with open("label_encoder.pkl", "rb") as f:
    label_encoder = pickle.load(f)

# --- Helper Functions ---
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    return ''.join(page.get_text() for page in doc)

def extract_text_from_txt(txt_path):
    with open(txt_path, "r", encoding="utf-8") as f:
        return f.read()

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# --- Routes ---
@app.route('/')
def home():
    return render_template("home.html")

@app.route("/recommender", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        file = request.files.get("resume")

        if not file or file.filename == "":
            return render_template("resume.html", error="Please upload a PDF or TXT resume.")

        if allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(filepath)

            try:
                ext = filename.rsplit('.', 1)[1].lower()

                if ext == "pdf":
                    raw_text = extract_text_from_pdf(filepath)
                elif ext == "txt":
                    raw_text = extract_text_from_txt(filepath)

                cleaned = clean_text(raw_text)
                vector = tfidf.transform([cleaned])
                prediction = model.predict(vector)
                predicted_role = label_encoder.inverse_transform(prediction)[0]

                return render_template("resume.html", prediction=predicted_role, resume_text=raw_text)

            except Exception as e:
                return render_template("resume.html", error=f"Error processing resume: {str(e)}")

        else:
            return render_template("resume.html", error="Allowed file types: PDF, TXT.")

    return render_template("resume.html")

@app.route('/pred', methods=['POST'])
def analyze_resume():
    file = request.files.get("resume")
    if not file or not allowed_file(file.filename):
        return jsonify({"success": False, "error": "Invalid file type."})

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    ext = filename.rsplit('.', 1)[1].lower()
    if ext == "pdf":
        raw_text = extract_text_from_pdf(filepath)
    else:
        raw_text = extract_text_from_txt(filepath)

    cleaned = clean_text(raw_text)
    vector = tfidf.transform([cleaned])
    prediction = model.predict(vector)
    predicted_role = label_encoder.inverse_transform(prediction)[0]

    # Dummy response for now – Replace with actual extracted values
    response = {
        "success": True,
        "category": "Software Engineering",
        "job": predicted_role,
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "123-456-7890",
        "skills": ["Python", "Flask", "Machine Learning"],
        "education": ["B.Sc in CS - ABC University", "M.Sc in AI - XYZ Institute"]
    }
    return jsonify(response)

@app.route('/screener', methods=["GET", "POST"])
def screener():
    if request.method == "POST":
        job_desc = clean_text(request.form.get("job_description", ""))

        resume_texts = []
        resume_names = []

        for file in request.files.getlist("resumes"):
            if allowed_file(file.filename):
                filename = secure_filename(file.filename)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)

                ext = filename.rsplit('.', 1)[1].lower()
                if ext == "pdf":
                    text = extract_text_from_pdf(filepath)
                else:
                    text = extract_text_from_txt(filepath)

                resume_texts.append(clean_text(text))
                resume_names.append(filename)

        all_docs = resume_texts + [job_desc]
        vectors = tfidf.transform(all_docs)
        job_vector = vectors[-1]
        resume_vectors = vectors[:-1]

        scores = cosine_similarity(job_vector, resume_vectors).flatten()
        results = [{'name': name, 'score': round(float(score) * 100, 2)} for name, score in zip(resume_names, scores)]
        results.sort(key=lambda x: x['score'], reverse=True)

        return render_template("resume_screener.html", results=results)

    return render_template("resume_screener.html")

if __name__ == "__main__":
    app.run(debug=True)
