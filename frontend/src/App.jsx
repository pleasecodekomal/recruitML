import React, { useState } from "react";
import {
  FileSearch,
  Users,
  Sparkles,
  Send,
  CheckCircle2,
  XCircle,
  Download,
  UploadCloud,
  Briefcase,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Mail,
  CheckSquare,
  Square,
  Cpu,
  BarChart3,
  Layers,
  Settings,
  HelpCircle,
  User,
  Sun,
  Moon
} from "lucide-react";
import BiasToggle from "./BiasToggle";
import {
  analyzeSingleResume,
  chatWithResume,
  getDreamJobGapAnalysis,
  extractJDSkills,
  screenBatchResumesWeighted,
  sendCandidateEmails
} from "./api";

export default function App() {
  const [activeTab, setActiveTab] = useState("screener");
  const [anonymize, setAnonymize] = useState(false);
  
  // Theme State: 'light' or 'dark' (Default = Light Mode)
  const [theme, setTheme] = useState('light');
  const isDark = theme === 'dark';

  // Single Analyzer State
  const [singleFile, setSingleFile] = useState(null);
  const [singleResult, setSingleResult] = useState(null);
  const [userQuery, setUserQuery] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Dream Job State
  const [selectedDreamJobs, setSelectedDreamJobs] = useState([]);
  const [gapAnalysisResults, setGapAnalysisResults] = useState([]);
  const [gapLoading, setGapLoading] = useState(false);

  // Batch Screener State
  const [jobDescription, setJobDescription] = useState("");
  const [batchFiles, setBatchFiles] = useState(null);
  const [screenerResults, setScreenerResults] = useState([]);
  const [extractedJDSkills, setExtractedJDSkills] = useState([]);
  const [skillWeights, setSkillWeights] = useState({});

  // Email Modal State
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailType, setEmailType] = useState("acceptance");
  const [emailSubject, setEmailSubject] = useState("Update regarding your application at RecruitML");
  const [emailBody, setEmailBody] = useState(
    "Dear {candidate_name},\n\nWe were impressed with your match results! We would like to invite you for the next interview round.\n\nBest regards,\nRecruiting Team"
  );
  const [emailSending, setEmailSending] = useState(false);

  // Inline Chat State
  const [expandedCandidateId, setExpandedCandidateId] = useState(null);
  const [candidateQueries, setCandidateQueries] = useState({});
  const [candidateAnswers, setCandidateAnswers] = useState({});
  const [candidateChatLoading, setCandidateChatLoading] = useState({});

  const [loading, setLoading] = useState(false);

  // Handle JD Skill Extraction
  const handleJDChange = async (text) => {
    setJobDescription(text);
    if (text.trim().length > 30) {
      try {
        const data = await extractJDSkills(text);
        setExtractedJDSkills(data.skills);
        const weights = {};
        data.skills.forEach((s) => (weights[s] = 100));
        setSkillWeights(weights);
      } catch (err) {
        console.error("JD Skill extraction error:", err);
      }
    }
  };

  const handleWeightChange = (skill, val) => {
    setSkillWeights((prev) => ({ ...prev, [skill]: parseInt(val, 10) }));
  };

  // Single Resume Handlers
  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!singleFile) return alert("Please select a resume file.");
    setLoading(true);
    try {
      const data = await analyzeSingleResume(singleFile);
      setSingleResult(data);
    } catch (err) {
      alert("Analysis error: " + err.message);
      setSingleFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!singleResult?.raw_text) return alert("No resume text loaded.");
    if (!userQuery.trim()) return;
    setChatLoading(true);
    try {
      const res = await chatWithResume(singleResult.raw_text, userQuery, anonymize);
      setChatAnswer(res.answer);
    } catch (err) {
      alert("Chat error: " + err.message);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAddDreamJob = async (jobName) => {
    if (!selectedDreamJobs.includes(jobName)) {
      const updated = [...selectedDreamJobs, jobName];
      setSelectedDreamJobs(updated);
      setGapLoading(true);
      try {
        const data = await getDreamJobGapAnalysis(singleResult.parsed_info?.skills || [], updated);
        setGapAnalysisResults(data.gap_matrix);
      } catch (err) {
        alert("Gap analysis error: " + err.message);
      } finally {
        setGapLoading(false);
      }
    }
  };

  const handleRemoveDreamJob = async (jobName) => {
    const updated = selectedDreamJobs.filter((j) => j !== jobName);
    setSelectedDreamJobs(updated);
    if (updated.length === 0) return setGapAnalysisResults([]);
    setGapLoading(true);
    try {
      const data = await getDreamJobGapAnalysis(singleResult.parsed_info?.skills || [], updated);
      setGapAnalysisResults(data.gap_matrix);
    } catch (err) {
      alert("Gap analysis error: " + err.message);
    } finally {
      setGapLoading(false);
    }
  };

  const handleInlineCandidateChat = async (candId, rawText) => {
    const query = candidateQueries[candId];
    if (!query?.trim()) return;
    setCandidateChatLoading((prev) => ({ ...prev, [candId]: true }));
    try {
      const res = await chatWithResume(rawText, query, anonymize);
      setCandidateAnswers((prev) => ({ ...prev, [candId]: res.answer }));
    } catch (err) {
      alert("Chat error: " + err.message);
    } finally {
      setCandidateChatLoading((prev) => ({ ...prev, [candId]: false }));
    }
  };

  // Batch Submit
  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (!jobDescription || !batchFiles || batchFiles.length === 0) {
      return alert("Please provide a Job Description and attach resume files.");
    }
    setLoading(true);
    try {
      const data = await screenBatchResumesWeighted(jobDescription, batchFiles, skillWeights);
      setScreenerResults(data.results);
      setSelectedCandidates([]);
    } catch (err) {
      alert("Screening error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCandidateSelect = (candId) => {
    setSelectedCandidates((prev) =>
      prev.includes(candId) ? prev.filter((id) => id !== candId) : [...prev, candId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCandidates.length === screenerResults.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(screenerResults.map((c, i) => c.candidate_id || `cand-${i}`));
    }
  };

  const handleDispatchEmails = async () => {
    if (selectedCandidates.length === 0) return alert("Select at least one candidate.");
    setEmailSending(true);
    try {
      const recipients = screenerResults
        .filter((c, i) => selectedCandidates.includes(c.candidate_id || `cand-${i}`))
        .map((c) => ({
          candidate_id: c.candidate_id,
          name: c.parsed_info?.name || c.filename,
          email: c.parsed_info?.email || "candidate@example.com"
        }));

      await sendCandidateEmails({
        recipients,
        email_type: emailType,
        custom_subject: emailSubject,
        custom_body: emailBody
      });

      alert(`Dispatched ${emailType} notifications to ${recipients.length} candidates!`);
      setShowEmailModal(false);
    } catch (err) {
      alert("Email dispatch error: " + err.message);
    } finally {
      setEmailSending(false);
    }
  };

  const exportToCSV = () => {
    if (screenerResults.length === 0) return;
    const headers = [
      "Candidate ID",
      "Verdict",
      "Weighted Match Score (%)",
      "Semantic Score (%)",
      "Skill Score (%)",
      "Matched Skills",
      "Missing Skills",
      "AI Rationale"
    ];
    const rows = screenerResults.map((c, i) => [
      anonymize ? c.candidate_id || `Candidate #${i + 1}` : c.filename,
      c.verdict || "N/A",
      c.match_score,
      c.semantic_score,
      c.skill_match_score,
      `"${c.matched_skills.join(", ")}"`,
      `"${c.missing_skills.join(", ")}"`,
      `"${(c.nl_summary || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", anonymize ? "RecruitML_Anonymized_Report.csv" : "RecruitML_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Color Palette Definitions based on Theme
  const themeColors = {
    bgPage: isDark ? '#0B0F19' : '#F8FAFC',
    bgSidebar: isDark ? '#0F172A' : '#FFFFFF',
    bgHeader: isDark ? '#0F172A' : '#FFFFFF',
    bgCard: isDark ? '#1E293B' : '#FFFFFF',
    bgSubCard: isDark ? '#0F172A' : '#FAFBFD',
    border: isDark ? '#334155' : '#E2E8F0',
    borderSubtle: isDark ? '#1E293B' : '#F1F5F9',
    textMain: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accentBlue: '#2563EB',
    accentHover: '#1D4ED8',
    inputBg: isDark ? '#0F172A' : '#FFFFFF'
  };

  return (
    <div style={{ display: 'flex', width: '100vw', minHeight: '100vh', backgroundColor: themeColors.bgPage, color: themeColors.textMain }}>
      
      {/* 1. LEFT SIDEBAR */}
      <aside style={{
        width: '260px',
        minWidth: '260px',
        backgroundColor: themeColors.bgSidebar,
        borderRight: `1px solid ${themeColors.border}`,
        padding: '24px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        height: '100vh',
        boxSizing: 'border-box',
        zIndex: 100
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '34px', height: '34px', backgroundColor: '#2563EB', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)' }}>
              <Cpu size={18} color="#FFFFFF" />
            </div>
            <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', color: themeColors.textMain }}>RecruitML</span>
          </div>

          <div style={{ marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: themeColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
              Core Workspaces
            </span>

            <button
              onClick={() => setActiveTab("screener")}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: 'none',
                backgroundColor: activeTab === "screener" ? (isDark ? '#1E293B' : '#EFF6FF') : 'transparent',
                color: activeTab === "screener" ? '#2563EB' : themeColors.textMuted,
                fontWeight: activeTab === "screener" ? 700 : 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left'
              }}
            >
              <Users size={16} />
              <span>Batch Screener</span>
            </button>

            <button
              onClick={() => setActiveTab("analyzer")}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: 'none',
                backgroundColor: activeTab === "analyzer" ? (isDark ? '#1E293B' : '#EFF6FF') : 'transparent',
                color: activeTab === "analyzer" ? '#2563EB' : themeColors.textMuted,
                fontWeight: activeTab === "analyzer" ? 700 : 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left'
              }}
            >
              <FileSearch size={16} />
              <span>Career Analyzer</span>
            </button>

            <button style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', color: themeColors.textMuted, fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
              <Layers size={16} />
              <span>Talent Repositories</span>
            </button>
          </div>
        </div>

        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: themeColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>System</span>
          <button style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', color: themeColors.textMuted, fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
            <Settings size={16} /> Preferences
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', color: themeColors.textMuted, fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
            <HelpCircle size={16} /> Documentation
          </button>

          <div style={{ marginTop: '16px', backgroundColor: isDark ? '#1E293B' : '#F1F5F9', border: `1px solid ${themeColors.border}`, padding: '8px 12px', borderRadius: '9999px', fontSize: '11px', color: themeColors.textMuted, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '7px', height: '7px', backgroundColor: '#10B981', borderRadius: '50%', boxShadow: '0 0 8px #10B981' }}></span>
            <span>API Engine v2.4 Online</span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: 'calc(100vw - 260px)', minWidth: 0, backgroundColor: themeColors.bgPage }}>
        
        {/* TOP HEADER */}
        <header style={{ height: '64px', borderBottom: `1px solid ${themeColors.border}`, backgroundColor: themeColors.bgHeader, padding: '0 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: themeColors.textMuted }}>Platform</span>
            <span style={{ color: themeColors.border }}>/</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: themeColors.textMain }}>
              {activeTab === 'screener' ? 'Batch Talent Screener' : 'Candidate Career Analyzer'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            
            {/* THEME TOGGLE BUTTON */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '9999px',
                border: `1px solid ${themeColors.border}`, backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                color: themeColors.textMain, fontWeight: 700, fontSize: '12px', cursor: 'pointer'
              }}
            >
              {isDark ? <Sun size={15} color="#F59E0B" /> : <Moon size={15} color="#6366F1" />}
              <span>{isDark ? 'Light Theme' : 'Dark Theme'}</span>
            </button>

            <BiasToggle anonymize={anonymize} setAnonymize={setAnonymize} />

            {/* Recruiter Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: isDark ? '#1E293B' : '#F1F5F9', border: `1px solid ${themeColors.border}`, padding: '4px 12px 4px 4px', borderRadius: '9999px', color: themeColors.textMain }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={14} color="#FFFFFF" />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Senior Recruiter</span>
            </div>
          </div>
        </header>

        {/* HERO BANNER SECTION */}
        <section style={{ padding: '44px 36px 28px 36px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box' }} className={isDark ? 'hero-dot-pattern-dark' : 'hero-dot-pattern'}>
          <div style={{ backgroundColor: isDark ? '#1E293B' : '#EFF6FF', color: '#2563EB', padding: '4px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', border: '1px solid #BFDBFE' }}>
            <Sparkles size={13} color="#2563EB" /> AI Match & RAG Assistant
          </div>

          <h1 style={{ fontSize: '36px', fontWeight: 900, lineHeight: '1.25', letterSpacing: '-1px', color: themeColors.textMain, margin: 0 }}>
            AI-driven recruitment that <br />
            <span className="text-highlight-pill">earns trust</span> in every hire
          </h1>

          <p style={{ maxWidth: '620px', fontSize: '14px', color: themeColors.textMuted, lineHeight: '1.6', marginTop: '12px' }}>
            Automated semantic matching, weighted skill degree scoring, and non-biased candidate screening built for enterprise talent acquisition.
          </p>
        </section>

        {/* WORKSPACE CONTENT CONTAINER */}
        <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto 100px auto', padding: '0 36px', boxSizing: 'border-box' }}>
          
          {/* TAB 1: BATCH SCREENER */}
          {activeTab === "screener" && (
            <div style={{ backgroundColor: themeColors.bgCard, borderRadius: '16px', border: `1px solid ${themeColors.border}`, padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: isDark ? '#0F172A' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Briefcase size={20} color="#2563EB" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: themeColors.textMain }}>Execute Batch Candidate Screening</h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: themeColors.textMuted }}>
                    Paste target Job Description to extract skill taxonomy, adjust degree weights, and screen candidates.
                  </p>
                </div>
              </div>

              <form onSubmit={handleBatchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: themeColors.textMain, display: 'block', marginBottom: '6px' }}>Target Job Requisition</label>
                  <textarea
                    rows={4}
                    style={{ width: '100%', padding: '14px', borderRadius: '10px', border: `1px solid ${themeColors.border}`, fontSize: '13px', fontFamily: 'inherit', backgroundColor: themeColors.inputBg, color: themeColors.textMain, boxSizing: 'border-box' }}
                    placeholder="Paste job description requirements and skill expectations..."
                    value={jobDescription}
                    onChange={(e) => handleJDChange(e.target.value)}
                  />
                </div>

                {/* SKILL DEGREE WEIGHTS SLIDERS */}
                {extractedJDSkills.length > 0 && (
                  <div style={{ backgroundColor: themeColors.bgSubCard, padding: '16px', borderRadius: '12px', border: `1px solid ${themeColors.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <Sliders size={16} color="#2563EB" />
                      <strong style={{ fontSize: '14px', color: themeColors.textMain }}>Requirement Importance Degree Weights</strong>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                      {extractedJDSkills.map((skill, idx) => (
                        <div key={idx} style={{ backgroundColor: themeColors.bgCard, padding: '10px 14px', borderRadius: '8px', border: `1px solid ${themeColors.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: themeColors.textMain, marginBottom: '6px' }}>
                            <span>{skill}</span>
                            <span style={{ color: '#2563EB', fontWeight: 700 }}>{skillWeights[skill] || 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="10"
                            value={skillWeights[skill] || 100}
                            onChange={(e) => handleWeightChange(skill, e.target.value)}
                            style={{ width: '100%', cursor: 'pointer' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: themeColors.textMain, display: 'block', marginBottom: '6px' }}>Candidate Resumes Pool (PDF / TXT)</label>
                  <div style={{ border: `2px dashed ${themeColors.border}`, borderRadius: '12px', padding: '24px', backgroundColor: themeColors.bgSubCard, textAlign: 'center' }}>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.txt"
                      id="batch-file-upload"
                      onChange={(e) => setBatchFiles(e.target.files)}
                      style={{ display: "none" }}
                    />
                    <label htmlFor="batch-file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <UploadCloud size={32} color="#2563EB" />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: themeColors.textMain }}>
                        {batchFiles && batchFiles.length > 0 ? `${batchFiles.length} resume file(s) selected` : "Click to select candidate resumes"}
                      </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: '#2563EB', color: '#FFFFFF', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)', opacity: loading ? 0.7 : 1, alignSelf: 'flex-start'
                  }}
                >
                  {loading ? "Screening Candidate Pool..." : "Run AI Screener"}
                </button>
              </form>

              {/* LEADERBOARD */}
              {screenerResults.length > 0 && (
                <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: `1px dashed ${themeColors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: themeColors.textMain }}>Screening Leaderboard</h3>
                      <button onClick={toggleSelectAll} style={{ backgroundColor: themeColors.bgSubCard, color: themeColors.textMain, padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {selectedCandidates.length === screenerResults.length ? <CheckSquare size={14} /> : <Square size={14} />}
                        {selectedCandidates.length === screenerResults.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {selectedCandidates.length > 0 && (
                        <button onClick={() => setShowEmailModal(true)} style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '6px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Mail size={14} /> Email Selected ({selectedCandidates.length})
                        </button>
                      )}
                      <button onClick={exportToCSV} style={{ backgroundColor: themeColors.bgCard, color: themeColors.textMain, padding: '6px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '12px', border: `1px solid ${themeColors.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Download size={14} /> Export CSV
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {screenerResults.map((candidate, index) => {
                      const candKey = candidate.candidate_id || `cand-${index}`;
                      const isExpanded = expandedCandidateId === candKey;
                      const isSelected = selectedCandidates.includes(candKey);

                      const verdictStyle = 
                        candidate.verdict === "STRONG MATCH" ? { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' } :
                        candidate.verdict === "SLIGHT MATCH" ? { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' } :
                        { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' };

                      return (
                        <div key={index} style={{ backgroundColor: themeColors.bgCard, border: `1px solid ${isSelected ? "#2563EB" : themeColors.border}`, borderRadius: '12px', padding: '16px' }}>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <button type="button" onClick={() => toggleCandidateSelect(candKey)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                {isSelected ? <CheckSquare size={18} color="#2563EB" /> : <Square size={18} color={themeColors.textMuted} />}
                              </button>
                              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: themeColors.textMain }}>
                                {anonymize ? candidate.candidate_id || `Candidate #${index + 1}` : candidate.filename}
                              </h4>
                              <span style={{ backgroundColor: verdictStyle.bg, color: verdictStyle.color, border: `1px solid ${verdictStyle.border}`, padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700 }}>
                                {candidate.verdict || "ANALYZED"}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <button onClick={() => setExpandedCandidateId(isExpanded ? null : candKey)} style={{ backgroundColor: themeColors.bgSubCard, color: themeColors.textMain, padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UserCheck size={14} />
                                {isExpanded ? "Close RAG & Extraction" : "Analyze Candidate"}
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                              <div style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: 800 }}>
                                Match: {candidate.match_score}%
                              </div>
                            </div>
                          </div>

                          {candidate.nl_summary && (
                            <div style={{ backgroundColor: themeColors.bgSubCard, padding: '10px 14px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, fontSize: '12px', color: themeColors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <BarChart3 size={15} color="#2563EB" style={{ flexShrink: 0 }} />
                              <span><strong>AI Rationale:</strong> {candidate.nl_summary}</span>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px', marginTop: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: themeColors.bgSubCard, padding: '12px', borderRadius: '8px' }}>
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: themeColors.textMuted }}>
                                  <span>Semantic Match</span> <span>{candidate.semantic_score}%</span>
                                </div>
                                <div style={{ height: '6px', backgroundColor: themeColors.border, borderRadius: '9999px', overflow: 'hidden', marginTop: '4px' }}>
                                  <div style={{ height: '100%', width: `${candidate.semantic_score}%`, backgroundColor: themeColors.textMain }}></div>
                                </div>
                              </div>

                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: themeColors.textMuted }}>
                                  <span>Skill Degree Overlap</span> <span>{candidate.skill_match_score}%</span>
                                </div>
                                <div style={{ height: '6px', backgroundColor: themeColors.border, borderRadius: '9999px', overflow: 'hidden', marginTop: '4px' }}>
                                  <div style={{ height: '100%', width: `${candidate.skill_match_score}%`, backgroundColor: '#2563EB' }}></div>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#065F46', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckCircle2 size={12} /> Matched ({candidate.matched_skills?.length || 0})
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                  {candidate.matched_skills?.map((s, idx) => (
                                    <span key={idx} style={{ backgroundColor: '#ECFDF5', color: '#065F46', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{s}</span>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <XCircle size={12} /> Missing ({candidate.missing_skills?.length || 0})
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                  {candidate.missing_skills?.map((s, idx) => (
                                    <span key={idx} style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{s}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* INLINE DRAWER */}
                          {isExpanded && (
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px dashed ${themeColors.border}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ backgroundColor: themeColors.bgSubCard, padding: '12px 14px', borderRadius: '8px', border: `1px solid ${themeColors.border}` }}>
                                <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 800, color: themeColors.textMain }}>Candidate Extraction Profile</h5>
                                {anonymize ? (
                                  <p style={{ fontSize: '12px', color: '#2563EB', margin: 0 }}>🔒 Bias Reduction Active: Personal contact details redacted.</p>
                                ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12px', color: themeColors.textMain }}>
                                    <p><strong>Predicted Role:</strong> {candidate.predicted_role || "N/A"}</p>
                                    <p><strong>Name:</strong> {candidate.parsed_info?.name || "N/A"}</p>
                                    <p><strong>Email:</strong> {candidate.parsed_info?.email || "N/A"}</p>
                                    <p><strong>Phone:</strong> {candidate.parsed_info?.phone || "N/A"}</p>
                                  </div>
                                )}
                              </div>

                              <div style={{ backgroundColor: themeColors.bgSubCard, padding: '12px 14px', borderRadius: '8px', border: `1px solid ${themeColors.border}` }}>
                                <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 800, color: themeColors.textMain }}>RAG Resume Q&A</h5>
                                <form onSubmit={(e) => { e.preventDefault(); handleInlineCandidateChat(candKey, candidate.raw_text); }} style={{ display: 'flex', gap: '8px' }}>
                                  <input
                                    type="text"
                                    placeholder="Ask question regarding candidate background..."
                                    value={candidateQueries[candKey] || ""}
                                    onChange={(e) => setCandidateQueries((prev) => ({ ...prev, [candKey]: e.target.value }))}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, fontSize: '13px', backgroundColor: themeColors.inputBg, color: themeColors.textMain }}
                                  />
                                  <button type="submit" disabled={candidateChatLoading[candKey]} style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '6px 14px', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                                    {candidateChatLoading[candKey] ? "..." : <Send size={14} />}
                                  </button>
                                </form>

                                {candidateAnswers[candKey] && (
                                  <div style={{ marginTop: '10px', padding: '10px', backgroundColor: themeColors.bgCard, borderRadius: '6px', borderLeft: '3px solid #2563EB', fontSize: '13px', color: themeColors.textMain }}>
                                    <strong>AI Response:</strong>
                                    <p style={{ margin: '4px 0 0 0' }}>{candidateAnswers[candKey]}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CANDIDATE CAREER ANALYZER */}
          {activeTab === "analyzer" && (
            <div style={{ backgroundColor: themeColors.bgCard, borderRadius: '16px', border: `1px solid ${themeColors.border}`, padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: isDark ? '#0F172A' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileSearch size={20} color="#2563EB" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: themeColors.textMain }}>Candidate Career Analyzer</h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: themeColors.textMuted }}>
                    Parse individual resumes to analyze role prediction rationales, extract skills, and run dream job gap matrices.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ border: `2px dashed ${themeColors.border}`, borderRadius: '12px', padding: '24px', backgroundColor: themeColors.bgSubCard, textAlign: 'center' }}>
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    id="single-file-upload"
                    onChange={(e) => setSingleFile(e.target.files ? e.target.files[0] : null)}
                    style={{ display: "none" }}
                  />
                  <label htmlFor="single-file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <UploadCloud size={32} color="#2563EB" />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: themeColors.textMain }}>
                      {singleFile ? singleFile.name : "Click to attach candidate resume"}
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !singleFile}
                  style={{
                    backgroundColor: '#2563EB', color: '#FFFFFF', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)', opacity: loading || !singleFile ? 0.6 : 1, alignSelf: 'flex-start'
                  }}
                >
                  {loading ? "Parsing Resume..." : "Analyze Candidate Profile"}
                </button>
              </form>

              {/* SINGLE RESULT CARD */}
              {singleResult && (
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ backgroundColor: themeColors.bgSubCard, padding: '20px', borderRadius: '12px', border: `1px solid ${themeColors.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                        ✓ Analysis Complete
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB' }}>
                        Predicted Role: {singleResult.predicted_role}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '13px', color: themeColors.textMain }}>
                      <p><strong>Name:</strong> {anonymize ? "█████████" : singleResult.parsed_info?.name || "N/A"}</p>
                      <p><strong>Email:</strong> {anonymize ? "█████████@redacted.com" : singleResult.parsed_info?.email || "N/A"}</p>
                      <p><strong>Phone:</strong> {anonymize ? "██████████" : singleResult.parsed_info?.phone || "N/A"}</p>
                    </div>

                    {singleResult.role_justification && (
                      <div style={{ backgroundColor: themeColors.bgCard, padding: '10px 14px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, fontSize: '12px', color: themeColors.textMain, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                        <BarChart3 size={16} color="#2563EB" style={{ flexShrink: 0 }} />
                        <span><strong>AI Justification:</strong> {singleResult.role_justification}</span>
                      </div>
                    )}
                  </div>

                  {/* DREAM JOB GAP MATRIX */}
                  <div style={{ backgroundColor: themeColors.bgSubCard, padding: '20px', borderRadius: '12px', border: `1px solid ${themeColors.border}` }}>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 800, color: themeColors.textMain }}>🎯 Target Role Gap Analysis</h3>
                    <p style={{ fontSize: '12px', color: themeColors.textMuted, margin: '0 0 12px 0' }}>Select target roles to calculate skill gap matrix and learning paths:</p>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      {(singleResult.available_dream_jobs || ["Python Developer", "Data Scientist / ML Engineer", "DevOps / Cloud Engineer", "Frontend Developer", "Full Stack Engineer"]).map((job, idx) => {
                        const isSelected = selectedDreamJobs.includes(job);
                        return (
                          <button
                            key={idx}
                            onClick={() => isSelected ? handleRemoveDreamJob(job) : handleAddDreamJob(job)}
                            style={{
                              padding: '5px 12px', borderRadius: '9999px', border: `1px solid ${themeColors.border}`,
                              backgroundColor: isSelected ? themeColors.textMain : themeColors.bgCard,
                              color: isSelected ? themeColors.bgPage : themeColors.textMain,
                              fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            {isSelected ? `✓ ${job}` : `+ ${job}`}
                          </button>
                        );
                      })}
                    </div>

                    {gapLoading && <p style={{ fontSize: '12px', color: themeColors.textMuted }}>Evaluating gaps...</p>}

                    {gapAnalysisResults.length > 0 && !gapLoading && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {gapAnalysisResults.map((matrix, i) => (
                          <div key={i} style={{ backgroundColor: themeColors.bgCard, padding: '12px', borderRadius: '8px', border: `1px solid ${themeColors.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <strong style={{ fontSize: '13px', color: themeColors.textMain }}>Role: {matrix.dream_job}</strong>
                              <span style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: 800 }}>Match: {matrix.match_percentage}%</span>
                            </div>
                            <div style={{ fontSize: '12px', color: themeColors.textMuted }}>
                              <strong>Recommendation:</strong> {matrix.recommendation}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* RAG CHAT */}
                  <div style={{ backgroundColor: themeColors.bgSubCard, padding: '20px', borderRadius: '12px', border: `1px solid ${themeColors.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Sparkles size={16} color="#2563EB" />
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: themeColors.textMain }}>Talk to Resume (RAG Assistant)</h3>
                    </div>
                    <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Ask candidate experience details..."
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, fontSize: '13px', backgroundColor: themeColors.inputBg, color: themeColors.textMain }}
                      />
                      <button type="submit" disabled={chatLoading} style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '6px 14px', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                        {chatLoading ? "..." : <Send size={14} />}
                      </button>
                    </form>
                    {chatAnswer && (
                      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: themeColors.bgCard, borderRadius: '6px', borderLeft: '3px solid #2563EB', fontSize: '13px', color: themeColors.textMain }}>
                        <strong>AI Response:</strong>
                        <p style={{ margin: '4px 0 0 0' }}>{chatAnswer}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* FOOTER */}
        <footer style={{ padding: '24px 36px', borderTop: `1px solid ${themeColors.border}`, backgroundColor: themeColors.bgHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginTop: 'auto', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <span style={{ fontWeight: 800, color: themeColors.textMain }}>Mainline</span> • AI Recruitment Architecture
          </div>
          <div style={{ display: 'flex', gap: '16px', color: themeColors.textMuted, fontSize: '12px' }}>
            <span>Privacy Policy</span>
            <span>Security & Compliance</span>
          </div>
        </footer>

      </div>

      {/* 3. FIXED FLOATING BOTTOM DOCK */}
      <div className={isDark ? "floating-bottom-dock floating-dock-dark" : "floating-bottom-dock floating-dock-light"}>
        <button
          onClick={() => setActiveTab("screener")}
          style={{
            background: activeTab === "screener" ? "#2563EB" : "transparent",
            color: activeTab === "screener" ? "#FFFFFF" : (isDark ? "#94A3B8" : "#475569"),
            border: "none", padding: "6px 16px", borderRadius: "9999px", fontSize: "12px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px"
          }}
        >
          <Users size={14} /> Screener
        </button>

        <button
          onClick={() => setActiveTab("analyzer")}
          style={{
            background: activeTab === "analyzer" ? "#2563EB" : "transparent",
            color: activeTab === "analyzer" ? "#FFFFFF" : (isDark ? "#94A3B8" : "#475569"),
            border: "none", padding: "6px 16px", borderRadius: "9999px", fontSize: "12px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px"
          }}
        >
          <FileSearch size={14} /> Career Gap Matrix
        </button>
      </div>

      {/* EMAIL MODAL */}
      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
          <div style={{ backgroundColor: themeColors.bgCard, padding: '28px', borderRadius: '16px', width: '90%', maxWidth: '520px', border: `1px solid ${themeColors.border}` }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: themeColors.textMain }}>Dispatch Candidate Emails</h3>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={() => setEmailType("acceptance")}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, backgroundColor: emailType === 'acceptance' ? '#10B981' : themeColors.bgSubCard, color: emailType === 'acceptance' ? '#FFFFFF' : themeColors.textMain, fontWeight: 700, cursor: 'pointer' }}
              >
                Acceptance
              </button>
              <button
                onClick={() => setEmailType("rejection")}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, backgroundColor: emailType === 'rejection' ? '#EF4444' : themeColors.bgSubCard, color: emailType === 'rejection' ? '#FFFFFF' : themeColors.textMain, fontWeight: 700, cursor: 'pointer' }}
              >
                Rejection
              </button>
            </div>

            <textarea
              rows={5}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, fontSize: '13px', backgroundColor: themeColors.inputBg, color: themeColors.textMain, marginBottom: '16px', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowEmailModal(false)} style={{ backgroundColor: themeColors.bgSubCard, color: themeColors.textMain, padding: '6px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '12px', border: `1px solid ${themeColors.border}`, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDispatchEmails} disabled={emailSending} style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '6px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', border: 'none', cursor: 'pointer' }}>
                {emailSending ? "Sending..." : "Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}