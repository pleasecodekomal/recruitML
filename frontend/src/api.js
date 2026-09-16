import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:5000/api/v1';

// 1. Upload & Analyze Single Resume (/api/v1/predict)
export const analyzeSingleResume = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post(`${API_BASE_URL}/predict`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// 2. Screen Batch Resumes Against Job Description (/api/v1/screener)
export const screenBatchResumes = async (jobDescription, files) => {
  const formData = new FormData();
  formData.append('job_description', jobDescription);

  // Append multiple resume files
  Array.from(files).forEach((file) => {
    formData.append('resumes', file);
  });

  const response = await axios.post(`${API_BASE_URL}/screener`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// 3. Talk to Resume (RAG Feature)
export const chatWithResume = async (resumeText, question, anonymize = false) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/chat-resume`, {
      resume_text: resumeText,
      question: question,
      anonymize: anonymize,
    });
    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.detail || "Failed to communicate with RAG Assistant";
    throw new Error(errorMsg);
  }
};

// 4. Get All Candidates Stored in Database
export const fetchCandidates = async () => {
  const response = await axios.get(`${API_BASE_URL}/candidates`);
  return response.data;
};

// 5. Dream Job Gap Analysis
export const getDreamJobGapAnalysis = async (extractedSkills, targetRoles) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/dream-job-gap`, {
      extracted_skills: extractedSkills,
      target_roles: targetRoles
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || "Failed to analyze dream job gaps.");
  }
};

// 6. Extract Skills from Job Description
export const extractJDSkills = async (jdText) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/extract-jd-skills`, {
      jd_text: jdText
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || "Failed to extract JD skills.");
  }
};

// 7. Screen Batch Resumes with Weighted Skills
export const screenBatchResumesWeighted = async (jobDescription, files, skillWeights) => {
  const formData = new FormData();
  formData.append("job_description", jobDescription);
  
  Array.from(files).forEach((file) => {
    formData.append("resumes", file);
  });
  
  if (skillWeights && Object.keys(skillWeights).length > 0) {
    formData.append("skill_weights_json", JSON.stringify(skillWeights));
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/screener`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || "Error screening resumes.");
  }
};

// 8. Send Candidate Emails
export const sendCandidateEmails = async (payload) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/send-emails`, payload);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || "Failed to dispatch emails.");
  }
};