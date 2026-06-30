export interface School {
  unitId: string;
  name: string;
  city: string | null;
  state: string | null;
  schoolUrl: string | null;
  ownership: string;
  admissionRate: number | null;
  inStateTuition: number | null;
  outOfStateTuition: number | null;
  averageCost: number | null;
  source: string;
  status: string;
  // Institutional classification — used to filter by degree level
  // Values: "four-year", "two-year", "less-than-two-year" (mirrors IPEDS classification)
  institutionLevel?: string;
  lastSyncedAt?: any;
}

export interface StudentProfile {
  level: string; // e.g. "Master's"
  field: string;
  gpa: string;
  // Which scale `gpa` is reported in. Drives normalisation in parseGpa().
  // Accepted values: "GPA (4.0 scale)" | "GPA (5.0 scale)" | "CWA (out of 100)"
  gradingSystem?: string;

  // Extra fields explicitly requested
  targetDegreeLevel?: string;
  degreeLevel?: string;
  satScore?: string | number;
  actScore?: string | number;
  greScore?: string | number;
  gmatScore?: string | number;
  homeCountry?: string;
  intendedMajor?: string;
  preferredState?: string;

  funding?: string;
  destination?: string;
  testType?: string;
  testScores?: string | any;
}

export interface SchoolMatch {
  school: School;
  matchScore: number; // 0 to 100
  category: "Strong Fit" | "Good Fit" | "Exploratory Fit" | "Not Recommended";
  budgetFit: "Excellent" | "Good" | "Stretch" | "Out of Budget";
  academicFit: "Likely" | "Target" | "Reach" | "High Reach" | "Possible" | "Competitive" | "Unknown" | "Limited Data";
  locationFit: "Yes" | "No";
  majorFit: "Likely Available" | "Unknown";
  internationalFit: "Likely Yes" | "Unknown";
  // 0–100 estimate of admission probability for THIS applicant at THIS school.
  // Computed from the school's overall admit rate adjusted by applicant strength.
  admissionLikelihood?: number;
  admissionBucket?: "reach" | "target" | "safety";
}

export interface ProfileAdvice {
  title: string;
  body: string;
  actions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// F-1 Visa Interview Simulator (practice-only feature)
// ─────────────────────────────────────────────────────────────────────────────

export type VisaInterviewMode = "text" | "voice" | "avatar";
export type VisaInterviewStatus = "active" | "completed" | "cancelled";
export type VisaMessageRole = "officer" | "student" | "system";
export type VisaDocumentType =
  | "i20"
  | "ds160_confirmation"
  | "bank_statement"
  | "employment_letter"
  | "sponsor_letter"
  | "transcript";

export type VisaApplicantContext =
  | "previous_refusal"
  | "changed_school_or_program"
  | "changed_funding_or_sponsor"
  | "document_practice"
  | "international_travel_history";

export interface VisaInterviewSession {
  id?: string;
  userId: string;
  visaType: "F1";
  status: VisaInterviewStatus;
  mode: VisaInterviewMode;
  avatarProvider: "heygen_liveavatar" | "none";
  currentStage: string;
  questionCount: number;
  disclaimerAccepted: boolean;
  documentsRequested: { i20: boolean; ds160: boolean };
  documentsUploaded:  { i20: boolean; ds160: boolean };
  creditsUsed: number;
  startedAt?: any;
  endedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface VisaInterviewMessage {
  id?: string;
  sessionId: string;
  userId: string;
  role: VisaMessageRole;
  text: string;
  stage?: string;
  createdAt: any;
}

export interface VisaInterviewDocument {
  id?: string;
  sessionId: string;
  userId: string;
  documentType: VisaDocumentType;
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  uploadedAt: any;
}

export interface VisaInterviewReport {
  id?: string;
  sessionId: string;
  userId: string;
  overallScore: number;
  clarityScore: number;
  consistencyScore: number;
  confidenceScore: number;
  financialReadinessScore: number;
  schoolProgramExplanationScore: number;
  careerPlanScore: number;
  homeTiesScore: number;
  documentReadinessScore: number;
  strengths: string[];
  weaknesses: string[];
  redFlagsToImprove: string[];
  recommendedPractice: string[];
  sampleImprovedAnswers: { question: string; improvedAnswer: string; whyBetter: string }[];
  disclaimer: string;
  questionBankName?: string;
  questionBankVersion?: string;
  scoringVersion?: string;
  createdAt: any;
}

export interface Program {
  id?: string;
  unitId: string;
  schoolId: string;
  schoolName: string;
  fieldName: string;
  normalizedField: string;
  cipCode?: string;
  cipFamily?: string;
  degreeLevel: "Undergraduate" | "Masters" | "Doctorate" | "Certificate" | "Unknown";
  credentialLevel: "undergraduate" | "masters" | "doctoral" | "certificate" | "unknown";
  source:
    | "college_scorecard_field_of_study"
    | "ipeds_completions"
    | "manual_verified"
    | "development_seed";
  programUrl?: string | null;
  status: "active" | "inactive";
  lastSyncedAt: any;
}
