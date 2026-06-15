export interface SupportArticle {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  routes: string[];
  sourceLabel: string;
  sourcePath: string;
}

export interface RankedSupportArticle {
  article: SupportArticle;
  score: number;
}

const SUPPORT_EMAIL = "support@collegeready.io";

export const SUPPORT_ARTICLES: SupportArticle[] = [
  {
    id: "product-overview",
    title: "What College Ready does",
    content:
      "College Ready helps prospective students research verified U.S. college programs, generate profile-based school matches, build an application roadmap, practice an F-1 visa interview with an AI avatar, and create or improve an academic CV. It is not a U.S. government, embassy, consular, law, or admissions service, and it cannot guarantee admission or a visa outcome.",
    keywords: ["what is college ready", "what does this app do", "features", "services", "government", "embassy", "guarantee"],
    routes: ["/"],
    sourceLabel: "About College Ready",
    sourcePath: "/",
  },
  {
    id: "matching",
    title: "School matching and match accuracy",
    content:
      "The matching flow uses the academic profile, intended field and degree level, budget or funding goals, and destination preferences entered by the user. Schools must have a verified College Scorecard program for the requested field and credential level before they are recommended. The result is a profile-based estimate grouped into Reach, Target, and Safety; it is not an admission decision or guarantee. Users should confirm deadlines and final program details on each school's official website.",
    keywords: ["matching", "match", "school results", "reach", "target", "safety", "accuracy", "admission chance", "program verified", "college scorecard"],
    routes: ["/intake", "/results", "/app/reports"],
    sourceLabel: "School matching",
    sourcePath: "/faq",
  },
  {
    id: "match-report-credits",
    title: "Match report credits and category reveals",
    content:
      "A full match report costs 1 credit. After that unlock, the Reach category is available immediately. Target and Safety are optional additional categories and each costs 5 credits to reveal. If the system cannot find eligible verified programs, it should not charge for an unlock. A report is guidance only and does not guarantee admission.",
    keywords: ["match report cost", "unlock report", "reach unlocked", "target locked", "safety locked", "reveal category", "bucket", "charged for report"],
    routes: ["/results", "/app/reports", "/pricing"],
    sourceLabel: "Match reports and credits",
    sourcePath: "/pricing",
  },
  {
    id: "credits",
    title: "Credits, free credits, and expiration",
    content:
      "New accounts receive 2 free credits. Credits are pay as you go and do not expire. Current feature costs are: match report 1 credit; reveal Target or Safety in an existing report 5 credits per category; full F-1 interview practice 15 credits; Academic CV review 5 credits; Academic CV build 8 credits; professional-to-academic CV conversion 8 credits. The assistant cannot see a user's wallet balance; signed-in users can view it on the dashboard Billing section.",
    keywords: ["credits", "credit balance", "free credits", "expire", "cost", "price per feature", "wallet", "how many credits"],
    routes: ["/pricing", "/app"],
    sourceLabel: "Credits and feature costs",
    sourcePath: "/pricing",
  },
  {
    id: "credit-packs",
    title: "Credit packs and Paystack checkout",
    content:
      "Credit packs are charged by Paystack in Ghanaian cedis, with a USD display price for reference. Current packs are Try: 6 credits for GHS 24, shown as USD 2; Starter: 15 for GHS 60, shown as USD 5; Plus: 45 for GHS 180, shown as USD 15; Pro: 120 for GHS 480, shown as USD 40; Power: 300 for GHS 1200, shown as USD 100. The server, not the browser, determines the pack price and credits.",
    keywords: ["credit pack", "paystack", "checkout", "ghana cedi", "ghs", "usd", "try pack", "starter", "plus", "pro", "power", "buy credits"],
    routes: ["/pricing", "/app"],
    sourceLabel: "Credit packs",
    sourcePath: "/pricing",
  },
  {
    id: "payments-refunds",
    title: "Payment delays, failed paid actions, and refunds",
    content:
      `Purchased credits normally appear within seconds. If they have not appeared after 2 minutes, email ${SUPPORT_EMAIL} with the Paystack confirmation or reference. Purchased credits are generally non-refundable except where required by law. If a paid action fails because of a College Ready outage, the spent credits should be refunded. The assistant cannot inspect payments, issue refunds, or change a wallet, so account-specific billing cases require human support.`,
    keywords: ["payment missing", "credits not added", "refund", "charged", "billing issue", "paystack reference", "payment confirmation", "outage", "failed action"],
    routes: ["/pricing", "/app", "/contact"],
    sourceLabel: "Billing support",
    sourcePath: "/contact",
  },
  {
    id: "referrals",
    title: "Referral credits",
    content:
      "A personal referral rewards the referrer with 5 credits only after the referred user completes their first paid credit purchase. Applying a referral code or merely creating an account does not trigger the referrer's reward. Campaign or marketer codes can have different new-user bonus rules.",
    keywords: ["referral", "refer friend", "referral reward", "referral code", "5 credits", "first purchase", "marketer code"],
    routes: ["/signup", "/login", "/app"],
    sourceLabel: "Referral program",
    sourcePath: "/app",
  },
  {
    id: "visa-overview",
    title: "F-1 visa interview practice",
    content:
      "Anna is an AI practice consular officer, not a real officer. A full practice session costs 15 credits, lasts up to 5 minutes, and includes a scored feedback report. The simulation and score are practice feedback only, not a prediction, legal advice, or a guarantee of a visa result. Real visa decisions are made by U.S. consular officers.",
    keywords: ["visa interview", "f1", "f-1", "anna", "consular officer", "score", "visa guarantee", "legal advice", "interview report"],
    routes: ["/app/visa-interview", "/app/interview-reports"],
    sourceLabel: "F-1 interview practice",
    sourcePath: "/terms",
  },
  {
    id: "visa-preview",
    title: "Free visa interview preview",
    content:
      "A signed-in user with fewer than 15 credits can use a free 3-minute interview preview once every 7 days. The preview does not charge credits and does not include a scored report. A user with at least 15 credits starts the full 5-minute paid session instead.",
    keywords: ["free interview", "preview interview", "3 minute", "three minute", "7 days", "cooldown", "no report", "15 credits"],
    routes: ["/app/visa-interview"],
    sourceLabel: "Interview preview",
    sourcePath: "/app/visa-interview",
  },
  {
    id: "visa-documents-browser",
    title: "Interview documents, microphone, and browser support",
    content:
      "The guided interview begins by requesting the user's own DS-160 confirmation page and Form I-20. The interview can request up to 3 additional supporting documents. Voice input is supported in Chrome, Edge, Brave, and Safari; Firefox does not provide the speech-recognition support this feature needs. Microphone permission and a stable connection are required. Users must not upload another person's documents.",
    keywords: ["ds-160", "ds160", "i-20", "i20", "supporting documents", "maximum supporting documents", "how many documents", "how many can i upload", "upload document", "microphone", "voice", "browser", "chrome", "edge", "brave", "safari", "firefox"],
    routes: ["/app/visa-interview"],
    sourceLabel: "Interview setup",
    sourcePath: "/app/visa-interview",
  },
  {
    id: "roadmap",
    title: "Application roadmap",
    content:
      "The application roadmap starts with a 6-question onboarding flow and creates a personalized checklist and current stage. It is free and does not use credits or an AI call. Users can rerun the diagnostic or update their stage without deleting completed checklist progress.",
    keywords: ["roadmap", "checklist", "application plan", "onboarding", "stage", "progress", "six questions", "6 questions", "free"],
    routes: ["/app/roadmap", "/app/roadmap/onboarding"],
    sourceLabel: "Application roadmap",
    sourcePath: "/app/roadmap",
  },
  {
    id: "cv-studio",
    title: "Academic CV Studio",
    content:
      "Academic CV Studio has three tools. Review and revamp costs 5 credits to unlock the full result. Build a new academic CV costs 8 credits. Convert a professional CV to academic format costs 8 credits. Each generation shows roughly the first 30 percent as a free preview before unlock, and each tool limits free generations to protect the service.",
    keywords: ["cv", "resume", "academic cv", "review cv", "build cv", "convert cv", "30 percent", "free preview", "download cv"],
    routes: ["/app/cv-studio"],
    sourceLabel: "Academic CV Studio",
    sourcePath: "/app/cv-studio",
  },
  {
    id: "authentication",
    title: "Sign-in, account linking, and sessions",
    content:
      `Users sign in with Google or a passwordless email link. If the same email was used with both methods, the app guides the user through linking them to one Firebase account. Historical duplicate-account or inaccessible-account cases may require ${SUPPORT_EMAIL}. Signed-in sessions automatically end after 15 minutes without user activity. Never share a sign-in link, password, verification code, or authentication token with the chatbot.`,
    keywords: ["login", "log in", "sign in", "signup", "sign up", "google", "email link", "magic link", "duplicate account", "link account", "signed out", "15 minutes", "session expired"],
    routes: ["/login", "/signup"],
    sourceLabel: "Account access",
    sourcePath: "/login",
  },
  {
    id: "privacy",
    title: "Privacy, uploaded documents, and data requests",
    content:
      `College Ready does not sell user data. Firebase provides authentication, database, storage, and functions; Anthropic processes supported AI tasks; HeyGen provides the live avatar; Google Cloud provides text-to-speech; and Vercel hosts the web app. Uploaded visa documents are stored privately for the user and Cloud Functions. Users can request access, correction, export, or deletion by emailing ${SUPPORT_EMAIL}; the privacy policy says requests are handled within 30 days. Do not paste document contents or highly sensitive personal data into support chat.`,
    keywords: ["privacy", "data", "sell data", "delete account", "delete data", "export data", "uploaded documents", "storage", "anthropic", "heygen", "firebase", "personal information"],
    routes: ["/privacy", "/contact"],
    sourceLabel: "Privacy policy",
    sourcePath: "/privacy",
  },
  {
    id: "technical-help",
    title: "Basic troubleshooting",
    content:
      `For a page or feature that is stuck, refresh once, confirm the internet connection, sign in again if the session expired, and retry in a supported browser. For voice interview issues, check microphone permission and use Chrome, Edge, Brave, or Safari. Do not repeatedly retry a payment. If the issue continues, contact ${SUPPORT_EMAIL} with the page, approximate time, visible error message, browser, and payment reference if relevant. Do not send passwords, sign-in links, full card details, or another person's documents.`,
    keywords: ["not working", "error", "bug", "stuck", "loading", "technical issue", "troubleshoot", "retry", "blank page", "browser issue"],
    routes: ["/contact"],
    sourceLabel: "Technical support",
    sourcePath: "/contact",
  },
  {
    id: "human-support",
    title: "Contacting human support",
    content:
      `Human support is available at ${SUPPORT_EMAIL} or through the Contact page. Contact support for account-specific billing, missing credits after 2 minutes, refund review, inaccessible or duplicate accounts, data requests, suspected security issues, or a paid feature that failed. Include the relevant page, approximate time, error message, and payment reference when applicable, but never include passwords, sign-in links, full card details, or another person's private documents.`,
    keywords: ["contact support", "human", "agent", "customer service", "email support", "speak to someone", "security issue", "account specific"],
    routes: ["/contact"],
    sourceLabel: "Contact support",
    sourcePath: "/contact",
  },
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does",
  "for", "from", "had", "has", "have", "help", "how", "i", "if", "in", "is", "it",
  "me", "most", "my", "need", "of", "on", "or", "please", "right", "so", "that",
  "the", "this", "to", "was", "what", "when", "where", "which", "with", "you", "your",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9$.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePromptInjectionPhrases(value: string): string {
  return value
    .replace(/\bignore (all|any|the|your)?\s*(previous|prior|above|system)?\s*instructions?\b/gi, " ")
    .replace(/\b(reveal|show|print|repeat|expose)\s+(your|the)?\s*system prompt\b/gi, " ")
    .replace(/\bsystem prompt\b/gi, " ")
    .replace(/\bact as\b/gi, " ")
    .replace(/\bdeveloper message\b/gi, " ");
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function routeMatches(currentRoute: string, articleRoute: string): boolean {
  if (articleRoute === "/") return currentRoute === "/";
  return currentRoute === articleRoute || currentRoute.startsWith(`${articleRoute}/`);
}

export function retrieveSupportArticles(
  query: string,
  currentRoute = "",
  limit = 5,
): RankedSupportArticle[] {
  const cleanedQuery = removePromptInjectionPhrases(query);
  const normalizedQuery = normalize(cleanedQuery);
  const queryTokens = new Set(tokenize(cleanedQuery));
  if (!normalizedQuery || queryTokens.size === 0) return [];

  return SUPPORT_ARTICLES
    .map((article) => {
      const titleTokens = new Set(tokenize(article.title));
      const contentTokens = new Set(tokenize(article.content));
      let score = 0;

      for (const keyword of article.keywords) {
        const normalizedKeyword = normalize(keyword);
        if (normalizedKeyword && normalizedQuery.includes(normalizedKeyword)) {
          score += normalizedKeyword.includes(" ") ? 12 : 7;
        }
        for (const token of tokenize(keyword)) {
          if (queryTokens.has(token)) score += 4;
        }
      }

      for (const token of queryTokens) {
        if (titleTokens.has(token)) score += 3;
        else if (contentTokens.has(token)) score += 1;
      }

      if (currentRoute && article.routes.some((route) => routeMatches(currentRoute, route))) {
        score += 2;
      }

      return { article, score };
    })
    .filter((ranked) => ranked.score >= 5)
    .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title))
    .slice(0, Math.max(1, Math.min(limit, 6)));
}

export function buildDeterministicSupportFallback(
  rankedArticles: RankedSupportArticle[],
): {
  answer: string;
  confidence: "high" | "medium" | "low";
  needsHuman: boolean;
  sources: Array<{ label: string; path: string }>;
  suggestedQuestions: string[];
} {
  if (rankedArticles.length === 0) {
    return {
      answer:
        `I don't have a verified College Ready answer for that. I can help with matching, credits and billing, the F-1 interview practice, the roadmap, CV Studio, account access, privacy, or technical issues. For anything else, contact ${SUPPORT_EMAIL}.`,
      confidence: "low",
      needsHuman: true,
      sources: [{ label: "Contact support", path: "/contact" }],
      suggestedQuestions: [
        "How do credits work?",
        "How does school matching work?",
        "How do I contact support?",
      ],
    };
  }

  const selected = rankedArticles.slice(0, 2);
  return {
    answer: selected.map(({ article }) => article.content).join("\n\n"),
    confidence: selected[0].score >= 14 ? "high" : "medium",
    needsHuman: selected.some(({ article }) =>
      article.id === "payments-refunds" ||
      article.id === "human-support" ||
      article.id === "authentication"
    ),
    sources: selected.map(({ article }) => ({
      label: article.sourceLabel,
      path: article.sourcePath,
    })),
    suggestedQuestions: [
      "What can the support assistant help with?",
      "How do credits work?",
      "How do I contact human support?",
    ],
  };
}
