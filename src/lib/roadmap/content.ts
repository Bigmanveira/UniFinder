// ─────────────────────────────────────────────────────────────────────────────
// Roadmap content — structured guidance shown after a match report.
// All copy below is original to Unifinder.
// ─────────────────────────────────────────────────────────────────────────────

export type CalloutTone = "info" | "warn";

export interface RoadmapAction {
  label: string;
  emoji?: string;
  /** External link */
  href?: string;
  /** Internal route (preferred when both are set) */
  to?: string;
}

export interface RoadmapCallout {
  tone: CalloutTone;
  body: string;
}

export interface RoadmapChecklistItem {
  id: string;
  label: string;
}

export interface RoadmapCard {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  bullets: string[];
  callouts?: RoadmapCallout[];
  actions?: RoadmapAction[];
  checklist?: RoadmapChecklistItem[];
}

export interface RoadmapStage {
  id: string;
  shortLabel: string;
  title: string;
  description: string;
  cards: RoadmapCard[];
}

export interface Roadmap {
  level: "postgrad" | "undergrad";
  title: string;
  stages: RoadmapStage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// POSTGRADUATE ROADMAP — Master's / PhD focused
// ─────────────────────────────────────────────────────────────────────────────
export const POSTGRAD_ROADMAP: Roadmap = {
  level: "postgrad",
  title: "Master's & PhD playbook",
  stages: [
    {
      id: "stage-1",
      shortLabel: "Funding",
      title: "How graduate funding actually works",
      description: "Tuition sticker prices look intimidating but most funded students never pay them. Start here so you understand the system before you spend a dollar on application fees.",
      cards: [
        {
          id: "s1-assistantships",
          emoji: "💡",
          title: "Assistantships: the real path to a paid degree",
          subtitle: "Universities pay you to study when you take on a graduate-level work role alongside your coursework.",
          bullets: [
            "Graduate Assistantships (GA): administrative or programme-support work for the university — tuition is waived and you receive a monthly stipend",
            "Teaching Assistantships (TA): you teach lab sections, run office hours, or grade for an undergrad course — typically requires you've taken a comparable class before",
            "Research Assistantships (RA): you join a professor's funded lab and contribute to active research — usually the most stable, multi-year form of support",
            "A typical full-time package: 100% tuition waiver, monthly stipend in the $1,000–$2,500 range, and student health insurance",
            "Plan on roughly 20 hours of work per week alongside your coursework — these are real jobs, not gifts",
          ],
          callouts: [
            { tone: "info", body: "RA offers carry the most weight. When a professor decides they want you in their lab, they can often lock in your funding before the admissions committee even votes." },
          ],
          actions: [
            { label: "Funded Master's guide", emoji: "📖", to: "/faq" },
          ],
        },
        {
          id: "s1-course-vs-research",
          emoji: "🔀",
          title: "Coursework vs thesis: pick the right track",
          subtitle: "This single decision shapes your funding chances, time-to-degree, and what comes next in your career.",
          bullets: [
            "Coursework Master's: a structured set of taught classes and exams. Usually wraps in 12–24 months. Funding for international students is limited and competitive",
            "Thesis Master's: you produce original research with a faculty advisor. Funding is far easier to secure since labs need researchers",
            "Aiming for a paid degree? Thesis programmes are where assistantships are concentrated — apply there if cost is a deal-breaker",
            "Heading straight into industry? A coursework programme with a strong career office and internship pipeline can get you to a job faster",
          ],
          callouts: [
            { tone: "warn", body: "Watch out for fee-funded programmes. Many high-profile coursework Master's in CS, Data Science, and Analytics at well-known schools effectively never fund international applicants. Always read the funding policy in writing before you apply." },
          ],
        },
      ],
    },
    {
      id: "stage-2",
      shortLabel: "Direction",
      title: "Define your direction",
      description: "A focused 'why' is the single biggest predictor of admission to a funded programme. Get specific now, before you write anything.",
      cards: [
        {
          id: "s2-clarify",
          emoji: "🎯",
          title: "Lock in your field and post-degree plan",
          subtitle: "Vague applicants get vague replies. Specific applicants land funded acceptances.",
          bullets: [
            "Pick a sub-field, not just a discipline: 'Machine Learning Systems' beats 'Computer Science', 'Health Economics' beats 'Economics'",
            "Concrete examples: Renewable Energy Systems, Computational Biology, Development Economics, Public Policy Analytics, Health Informatics, International Education Policy",
            "Settle the post-degree question: research career or working professional? Your answer changes which programmes make sense",
            "Industry-bound: prioritise programmes with strong employer pipelines, internships, and capstone projects",
            "Research-bound: target thesis programmes at PhD-granting institutions where the Master's can transition into the doctoral track",
            "Write a one-paragraph mission statement: what you want to study, why it matters to you, and what you'll do with the degree once you have it. Every application document flows from this paragraph",
          ],
          actions: [
            { label: "Explore matching programmes", emoji: "✨", to: "/intake" },
          ],
        },
      ],
    },
    {
      id: "stage-3",
      shortLabel: "Shortlist",
      title: "Build a funded shortlist",
      description: "The wrong shortlist will cost you a year. A good shortlist focuses only on programmes that actually fund international applicants.",
      cards: [
        {
          id: "s3-finding",
          emoji: "🏛️",
          title: "Spot the programmes that actually fund internationals",
          subtitle: "Funding-friendly programmes aren't always obvious from the surface. Here's how to identify them quickly.",
          bullets: [
            "Skip the university homepage. Open the actual department site and search for 'Financial Support', 'Funding', or 'Assistantships' — usually under 'Prospective Students'",
            "Send a one-line email to the graduate coordinator: 'Are international applicants eligible for assistantships in this programme?' Their reply (or silence) tells you everything",
            "Find current international graduate students on the department's people page. If they hold research roles or 'Teaching Fellow' titles, the programme funds them. If they're absent entirely, that's a red flag",
            "Stay clear of huge international cohorts in popular Master's programmes — those cohorts are designed around full-fee tuition, not assistantships",
            "Strong public R1s in middle-America locations (Iowa, Indiana, Tennessee, Missouri, Kansas) routinely fund international graduate students because they need to recruit talent. The Ivy League rarely does",
          ],
          actions: [
            { label: "Find matching programmes", emoji: "✨", to: "/intake" },
            { label: "Funded Master's guide", emoji: "📖", to: "/faq" },
          ],
        },
        {
          id: "s3-balanced-list",
          emoji: "⚖️",
          title: "A balanced list of 6–10 programmes",
          subtitle: "Apply to too few and you risk zero offers. Apply to too many and quality drops. The mix below is the sweet spot.",
          bullets: [
            "Apply to 6–10 programmes total. Roughly 2–3 ambitious, 3–4 well-matched, 2–3 safety",
            "Ambitious: programmes where your scores sit a notch below the typical admit. Apply, but don't bet your year on them",
            "Well-matched: your numbers fit the programme's median admit. This is where most of your offers will come from",
            "Safety: solid programmes that fund well, you'd genuinely be happy at, and where your profile sits comfortably above the median",
            "Set a hard ceiling on application fees from day one. Top programmes charge $90–$120 each — costs add up faster than you expect",
          ],
        },
      ],
    },
    {
      id: "stage-4",
      shortLabel: "Documents",
      title: "Prepare your application documents",
      description: "Strong documents win admissions decisions. Brilliant documents win funded admissions.",
      cards: [
        {
          id: "s4-sop",
          emoji: "✍️",
          title: "Statement of Purpose (SOP)",
          subtitle: "Treat the SOP as the piece of writing the committee will spend the most time on. Make it impossible to ignore.",
          bullets: [
            "Open with a specific moment: a research finding that surprised you, a problem you tried to solve, a mentor whose work changed how you think. Skip every 'ever since I was a child' opener",
            "Reference 2–3 faculty by name and tie their research to your own interests — proof that you've actually read the department's pages, not just admired the brand",
            "Build a clear arc: the work you've done, the questions you want to investigate next, the impact you plan to have once you graduate",
            "Cut the generic phrases. 'Make a difference', 'passionate about technology', 'pursue my dreams' — every applicant says these. Be concrete instead",
            "Stay under 1,000 words unless asked for more. Disciplined writing reads like disciplined thinking",
          ],
        },
        {
          id: "s4-cv",
          emoji: "📄",
          title: "Academic CV",
          subtitle: "A graduate-school CV is built around academic achievement, not professional employment. Reorder accordingly.",
          bullets: [
            "Suggested order: Education → Research → Publications & Presentations → Teaching → Awards → Technical Skills → References",
            "For each research project, devote two short lines: the question you investigated, and your specific contribution to it",
            "Include the work that's not on LinkedIn — conference posters, abstracts, undergraduate thesis, code repositories, technical reports",
            "Trim job experience that's unrelated to your field. Save the bartending and retail work for the next job application",
            "Cap the document at 2 pages. Make an exception only when you have a meaningful publication list to show",
          ],
        },
        {
          id: "s4-recs",
          emoji: "📜",
          title: "Recommendation letters",
          subtitle: "Programmes typically request 2–3 letters. Faculty letters dominate; manager letters fill gaps but rarely impress committees.",
          bullets: [
            "Choose professors who can speak to your academic ability, not just professors whose class you took. There's a real difference",
            "Hand each recommender 4 weeks of notice plus a complete packet: your CV, draft SOP, list of programmes with deadlines, and a brief reminder of what they could highlight",
            "If you've done research, your research supervisor must write one of your letters. Skipping them looks suspicious to admissions",
            "One employer letter is acceptable. All three from employers tells the committee you don't have academic relationships — that's a problem",
            "Send a brief reminder one week before each deadline, polite and via the official portal",
          ],
        },
        {
          id: "s4-tests",
          emoji: "🌐",
          title: "English proficiency & GRE",
          subtitle: "Test policies vary widely across programmes. Read each one's requirements page before scheduling anything.",
          bullets: [
            "TOEFL or IELTS is required for most international applicants. Common cutoffs: TOEFL iBT 90–100, IELTS Academic 6.5–7.0",
            "Many programmes waive English testing if your previous degree was conducted in English. Email the programme with proof — most will grant the waiver",
            "GRE is now optional at a growing number of programmes. Where it's still required, a strong score (Verbal + Quant ≥ 320) gives reach applications a meaningful boost",
            "GRE Subject Tests are largely defunct outside Physics, Mathematics, Chemistry, and Psychology. Only sit one if a programme explicitly asks",
            "Schedule the test at least 6 months before your earliest deadline. If you score lower than expected, you'll have time for a retake",
          ],
        },
      ],
    },
    {
      id: "stage-5",
      shortLabel: "Outreach",
      title: "Reach out to professors",
      description: "Direct outreach is the difference between funded and unfunded. Most applicants never bother — that's your opening.",
      cards: [
        {
          id: "s5-why-outreach",
          emoji: "📨",
          title: "Why professor outreach changes everything",
          subtitle: "In research programmes, individual faculty effectively decide who fills funded slots. The right email can change your entire application.",
          bullets: [
            "Lab heads pick their own students. The graduate admissions committee almost always defers to faculty recommendations on funding",
            "A genuinely interested reply from a professor is essentially an unofficial pre-admission. Their support drives the rest of the process",
            "Just one professor saying yes can land you a funded admit at a programme that would otherwise reject you",
            "Begin outreach 2–3 months before deadlines. Labs commit to incoming students early — late emails reach a closed slate",
            "Aim for 5–8 well-targeted professor emails per programme. Expect about a third to reply, fewer to be substantive",
          ],
        },
        {
          id: "s5-perfect-email",
          emoji: "✉️",
          title: "How to write the email that gets a reply",
          subtitle: "Short, specific, and personal. Three sentences referencing actual work beats three paragraphs of general enthusiasm.",
          bullets: [
            "Subject line: 'Prospective {Master's | PhD} applicant — interested in {their specific research area}'",
            "Sentence one: who you are in 12 words or less — your degree, your university, and your graduation year",
            "Sentence two: cite a specific paper, talk, or recent project of theirs and explain what about it caught your attention",
            "Sentence three: ask the actual question — 'Will you be accepting students for Fall 202X?' or 'May I share my CV for your consideration?'",
            "Attach only your 2-page CV. Don't attach SOPs, transcripts, or test scores unless the professor explicitly asks",
          ],
          callouts: [
            { tone: "info", body: "Substance beats length. One sentence about a specific paper they wrote tells a professor more than three paragraphs of enthusiasm about the field." },
          ],
        },
      ],
    },
    {
      id: "stage-6",
      shortLabel: "Submit",
      title: "Submit and secure funding",
      description: "Tailor every application. Submit on time. Pursue funding from every angle while you wait for decisions.",
      cards: [
        {
          id: "s6-submitting",
          emoji: "🚀",
          title: "Submitting applications",
          subtitle: "Most programmes sit between December and February deadlines. Funding offers go to early submissions — late applications fight for whatever's left.",
          bullets: [
            "Build a tracking spreadsheet with columns for: programme, deadline, fee, application status, recommender status, and offer status. Update it weekly",
            "Customise each SOP. At minimum, rewrite the paragraph that names the programme, faculty, and reasons for the choice. Generic SOPs are immediately obvious",
            "Submit at least 5 days before each deadline. Application portals reliably crash on deadline day — you don't want to be debugging at midnight",
            "Verify each recommender hit submit. Don't assume — log into the portal and check. Letters that arrive late are often disqualifying",
            "Pay fees with a credit card so you have transaction records. Many programmes grant fee waivers for low-income or international applicants — always ask before paying",
          ],
        },
        {
          id: "s6-funding",
          emoji: "💰",
          title: "How funding actually arrives",
          subtitle: "Different programmes deliver funding decisions on different schedules. Knowing the patterns helps you stay calm during the wait.",
          bullets: [
            "Some programmes send admission and funding together. If the offer reads well, accept after confirming details. If anything is unclear, ask follow-up questions before signing",
            "Many programmes admit first, then announce funding 2–6 weeks later. Don't panic in the silence — programmes that fund international students do communicate, just slowly",
            "Holding multiple offers? You can negotiate. A polite email to a target programme ('I have an offer with funding from another school') often unlocks a counter-offer",
            "External scholarships (Fulbright, Chevening, Mastercard Foundation, country-specific awards) often layer on top of assistantships. Apply to as many as you qualify for",
            "Don't accept an unfunded offer reflexively. Email the programme asking about assistantships, departmental fellowships, and external scholarship matching — they're more flexible than they look",
          ],
        },
      ],
    },
    {
      id: "stage-7",
      shortLabel: "Visa",
      title: "Visa process & departure",
      description: "After accepting an offer, the visa pipeline begins. Each step depends on the previous one — don't skip ahead.",
      cards: [
        {
          id: "s7-i20",
          emoji: "📑",
          title: "I-20 & F-1 student visa",
          subtitle: "The I-20 is the form your school issues once you formally accept. It's the prerequisite for everything else in the F-1 process.",
          bullets: [
            "Submit your formal acceptance through the programme's portal and pay any required enrolment deposit",
            "Provide the financial proof your school requires: bank statements, sponsorship letters, scholarship awards, or any combination accepted by the international office",
            "Allow 1–4 weeks for the I-20 to be issued. Request the digital copy first to start the next steps; the physical copy follows by courier",
            "Verify every field on the I-20 — name, date of birth, programme dates, funding amount. Errors require re-issuance and lose you weeks",
            "Sign and date the I-20 in blue ink as soon as it arrives, and take a photo of the signed copy as a backup",
          ],
        },
        {
          id: "s7-sevis",
          emoji: "💳",
          title: "SEVIS, DS-160 & embassy interview",
          subtitle: "Three procedural steps stand between you and your embassy interview. Complete them in order, days apart at minimum.",
          bullets: [
            "Step 1 — Pay the SEVIS I-901 fee through fmjfee.com. Print and save the receipt; you'll be asked for it twice",
            "Step 2 — Complete the DS-160 form online with absolute precision. Save the confirmation number, print the confirmation page, and bring both",
            "Step 3 — Pay the MRV (visa application) fee through your country's CGI Federal portal. Save this receipt as well",
            "Book your visa interview slot. Summer slots vanish first — book the moment your DS-160 is ready",
            "On interview day, bring: I-20, DS-160 confirmation page, SEVIS receipt, MRV receipt, valid passport, photo to consular spec, admission letter, and any financial documents",
          ],
        },
        {
          id: "s7-checklist",
          emoji: "📋",
          title: "Master's document checklist",
          subtitle: "Tick each item as you complete it. Missing documents are the most common cause of stalled applications and visa interviews.",
          bullets: [],
          checklist: [
            { id: "transcript",     label: "Official academic transcript (sealed copy + scanned PDF)" },
            { id: "wes",            label: "Credential evaluation (WES or programme-required evaluator)" },
            { id: "passport",       label: "Valid passport (≥ 6 months past programme start date)" },
            { id: "sop",            label: "Statement of Purpose (final draft, proofread)" },
            { id: "cv",             label: "Academic CV (≤ 2 pages)" },
            { id: "rec1",           label: "Recommendation letter #1 (academic source)" },
            { id: "rec2",           label: "Recommendation letter #2 (academic source)" },
            { id: "rec3",           label: "Recommendation letter #3 (research or academic)" },
            { id: "toefl",          label: "TOEFL / IELTS score report (or written waiver confirmation)" },
            { id: "gre",            label: "GRE score report (only where required)" },
            { id: "writing",        label: "Writing sample or portfolio (only where required)" },
            { id: "fee",            label: "Application fee paid or waiver granted" },
            { id: "offer",          label: "Admission offer letter signed and returned" },
            { id: "fin-docs",       label: "Financial documents for I-20 (bank statement, sponsor letter)" },
            { id: "i20",            label: "I-20 issued and signed in blue ink" },
            { id: "sevis",          label: "SEVIS I-901 receipt saved" },
            { id: "ds160",          label: "DS-160 confirmation page printed" },
            { id: "mrv",            label: "MRV visa application fee receipt saved" },
            { id: "interview",      label: "Visa interview slot booked" },
            { id: "visa",           label: "F-1 visa stamped on passport" },
            { id: "sevis-arrival",  label: "SEVIS arrival window confirmed with the school" },
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// UNDERGRADUATE ROADMAP — Bachelor's focused
// ─────────────────────────────────────────────────────────────────────────────
export const UNDERGRAD_ROADMAP: Roadmap = {
  level: "undergrad",
  title: "Bachelor's playbook",
  stages: [
    {
      id: "stage-1",
      shortLabel: "System",
      title: "How U.S. undergraduate admissions work",
      description: "U.S. admissions look at the whole person, not just the numbers. Understand the system before you start applying.",
      cards: [
        {
          id: "u1-holistic",
          emoji: "🎓",
          title: "Holistic admissions, explained",
          subtitle: "Universities here weigh far more than grades. Every part of your file does work.",
          bullets: [
            "Your grades and test scores establish baseline academic competency — they get you into the conversation, not over the line",
            "Essays, recommendations, and extracurriculars reveal who you are beyond the numbers",
            "Demonstrated interest, leadership, and measurable impact separate strong applicants from average ones",
            "The most selective schools admit shaped students, not perfect students. Depth of one or two passions beats a long shallow list",
            "Your story matters. Universities build an incoming class, not a leaderboard — you're competing on what you bring to the cohort",
          ],
        },
        {
          id: "u1-funding",
          emoji: "💰",
          title: "Need-aware vs need-blind for internationals",
          subtitle: "Most U.S. universities fund international students through merit aid rather than need-based aid. Knowing the distinction matters.",
          bullets: [
            "Need-blind for internationals (a small group: Harvard, Yale, Princeton, MIT, Amherst, Bowdoin, plus a few more): your finances do not affect your admission decision",
            "Need-aware for internationals (almost everywhere else): applying for aid can lower your odds. Read each school's policy carefully before checking the aid box",
            "Many universities offer merit-based scholarships up to full tuition. Search by school and apply early — scholarship deadlines often fall before admission deadlines",
            "Liberal arts colleges (Amherst, Williams, Pomona, Swarthmore) frequently offer the most generous international aid",
            "State flagship universities rarely give significant aid to internationals. Plan for full out-of-state tuition unless you have an explicit merit award in writing",
          ],
          callouts: [
            { tone: "warn", body: "Read each school's international aid policy line by line. Phrases like 'generous aid' often refer to U.S. domestic students only." },
          ],
        },
      ],
    },
    {
      id: "stage-2",
      shortLabel: "Choose",
      title: "Choose your major and your schools",
      description: "Build a balanced school list aligned with your major, your budget, and your admission profile.",
      cards: [
        {
          id: "u2-major",
          emoji: "🎯",
          title: "Picking a major (or going undecided)",
          subtitle: "You don't need a final answer, but a clear lean helps your application read coherently.",
          bullets: [
            "Most U.S. universities allow you to switch majors after enrolling. The pressure to declare is far lower than in most other systems",
            "Apply undecided if you genuinely don't know — for most schools it does not hurt your odds",
            "Strong applicants name 2–3 fields of interest and connect them with a clear narrative thread",
            "Engineering, business, and computer science are often capped majors. Applying directly is harder than applying undecided and transferring in once on campus",
            "Pre-med, pre-law, and pre-vet are tracks rather than majors. Pick any major you're curious about and complete the prerequisites separately",
          ],
        },
        {
          id: "u2-list",
          emoji: "🏫",
          title: "Build a school list of 8–12 schools",
          subtitle: "Apply to too few and you risk no offers. The right list gives you real options when decisions land.",
          bullets: [
            "Mix: 2–3 ambitious, 4–5 well-matched, 2–3 safety. Total 8–12 schools",
            "Ambitious: SAT/ACT and GPA below the school's middle 50% range, or extremely selective overall (admit rate under 20%)",
            "Well-matched: your scores fall inside the school's middle 50% and the school admits 30–60% of applicants",
            "Safety: your scores comfortably exceed the middle 50% and the school admits 60% or more",
            "Always include at least one strong-aid school you'd be genuinely happy attending if cost rules out your top picks",
          ],
          actions: [
            { label: "Find matching schools", emoji: "✨", to: "/intake" },
          ],
        },
      ],
    },
    {
      id: "stage-3",
      shortLabel: "Tests",
      title: "Test prep and course rigor",
      description: "Strong test scores open more doors. A challenging course load proves academic readiness.",
      cards: [
        {
          id: "u3-sat-act",
          emoji: "📝",
          title: "SAT or ACT: pick one and master it",
          subtitle: "Both tests are accepted everywhere. Choose the format you naturally score better on.",
          bullets: [
            "Take an official practice SAT and an official ACT. Choose whichever gives you the higher percentile — they convert differently and most students do markedly better on one",
            "Aim for the school's middle 50% range or higher. At the most selective schools that's SAT 1480+ or ACT 33+",
            "Schedule your first official test at least 6 months before your earliest deadline so you have room to retake",
            "Test-optional policies remain common. Even so, a strong score genuinely helps applications to highly selective schools",
            "Subject Tests are retired (College Board), and the few remaining schools that ever required them have stopped",
          ],
        },
        {
          id: "u3-courses",
          emoji: "📚",
          title: "Course rigor matters more than you think",
          subtitle: "U.S. admissions officers want to see that you challenged yourself with the toughest options available.",
          bullets: [
            "Take the most rigorous courses your school offers — AP, IB, A-levels, advanced honours, dual-enrolment",
            "5+ AP or IB courses across your high-school years is competitive at the most selective schools",
            "Strong grades in challenging courses beat perfect grades in easy ones, every time",
            "Senior-year course load matters. Admissions officers see your schedule before they make final decisions",
            "Consistent or upward grades are fine. Sharp downward trends raise concerns and need a clear explanation",
          ],
        },
      ],
    },
    {
      id: "stage-4",
      shortLabel: "Profile",
      title: "Build your application profile",
      description: "What you do outside the classroom shapes how schools see you. Depth and impact beat a long list of memberships.",
      cards: [
        {
          id: "u4-ec",
          emoji: "🌟",
          title: "Extracurriculars that actually move the needle",
          subtitle: "Depth, leadership, and measurable impact beat a 20-club résumé.",
          bullets: [
            "Pick 2–3 areas and go deep. Multi-year commitment with measurable outcomes reads stronger than scattered involvement",
            "Leadership: founded a club, led a team, organised an event. Concrete responsibility matters more than the title",
            "Impact: build something real. An app, a research paper, a non-profit, a 1,000-subscriber newsletter, an open-source project",
            "Hooks: unique skills, rare accomplishments, or stories that make you memorable in a stack of 30,000 applications",
            "Skip the resume padding. Admissions officers can spot it instantly and it actively hurts your file",
          ],
        },
        {
          id: "u4-summer",
          emoji: "☀️",
          title: "Summers count",
          subtitle: "What you do over summer often signals the kind of student you'll be on campus.",
          bullets: [
            "Research with a professor, even unpaid, is gold for STEM applicants",
            "Free or scholarship-funded programmes (RSI, MITES, Telluride, COSMOS, MathILy) are highly respected because they're competitive in their own right",
            "Self-directed projects work too — open-source software, independent research, founding a small startup, building something useful for your community",
            "Travel-only summer programmes are usually unimpressive to admissions officers who recognise pay-to-play",
            "Working a paying job is highly respected. Never hide it on the application — it shows responsibility",
          ],
        },
      ],
    },
    {
      id: "stage-5",
      shortLabel: "Essays",
      title: "Essays and recommendations",
      description: "These two pieces show admissions who you actually are. Treat them with serious effort.",
      cards: [
        {
          id: "u5-common-app",
          emoji: "📝",
          title: "The Common App personal statement",
          subtitle: "650 words. The single most-read part of your application file.",
          bullets: [
            "Pick one of the seven prompts. Most students choose either the joy/setback prompt or the new-perspective prompt — both let you tell a focused story",
            "Tell ONE specific story, not your entire life. Specificity is what makes a 17-year-old's writing stand out",
            "Show, don't tell. Readers should feel the moment you're describing, not be summarised at",
            "End on reflection that points forward. What did the experience teach you, and how is it shaping who you're becoming?",
            "Get feedback from 2–3 thoughtful readers, but don't let any single voice rewrite it. The essay must sound like you, not a committee",
          ],
        },
        {
          id: "u5-supplements",
          emoji: "✏️",
          title: "Supplemental essays",
          subtitle: "School-specific essays reveal whether you actually want to attend that school.",
          bullets: [
            "'Why us?' essays must name specific programmes, professors, courses, or traditions. Generic answers get tossed aside",
            "'Why this major?' essays should connect your background to your future plans, not just describe a passion",
            "Don't recycle essays without rewriting. Admissions officers can tell when a 'Why University X' essay was originally written for University Y",
            "Most schools have 1–4 supplements each. Budget your time honestly — supplements take longer to write well than the main personal statement",
            "Start supplements early. Drafts get better the longer you sit with them",
          ],
        },
        {
          id: "u5-recs",
          emoji: "📜",
          title: "Recommendation letters",
          subtitle: "Counsellor plus two teachers. Pick teachers who genuinely know you, not the most prestigious names available.",
          bullets: [
            "Most schools require: 1 counsellor letter + 2 teacher letters",
            "Pick teachers from your final two high-school years who taught you in core academic subjects",
            "If you're applying STEM, at least one teacher should be from a STEM subject. If humanities, the reverse",
            "Hand each teacher 4 weeks of notice plus a packet (resume, brag sheet, deadlines) so they can write something concrete",
            "Strong relationships matter more than 'prestigious' subject teachers. Pick the teacher who can describe your work specifically",
          ],
        },
      ],
    },
    {
      id: "stage-6",
      shortLabel: "Apply",
      title: "Apply across the right deadline tracks",
      description: "Submit polished applications across the deadline tracks that work in your favour.",
      cards: [
        {
          id: "u6-deadlines",
          emoji: "🗓️",
          title: "Early Decision, Early Action, Regular",
          subtitle: "Each track has different rules and different admit rates. Treat the choice strategically.",
          bullets: [
            "Early Decision (ED): binding. If admitted, you must enrol. Higher admit rate but you can only apply ED to one school",
            "Early Action (EA): non-binding. You apply early, hear back early, and have no commitment to enrol",
            "Restrictive Early Action (REA / SCEA): apply early to one private school plus only public-university early apps",
            "Regular Decision (RD): the standard track most students use. Decisions arrive in March or April",
            "Apply EA wherever you can. Earlier answers reduce stress and let you compare offers in time to make decisions",
          ],
        },
        {
          id: "u6-submit",
          emoji: "🚀",
          title: "Submitting your applications",
          subtitle: "Tactical reminders that prevent losing the year on a technicality.",
          bullets: [
            "Submit at least 3 days before each deadline. Servers crash on deadline day every single year — debugging at 11pm is not a strategy",
            "Confirm every recommender has submitted, every time. Don't assume their portal status updated automatically",
            "Pay close attention to score reporting. Official scores need to arrive at most schools by the deadline",
            "Check the application portal each school opens after submission, usually within 1–2 weeks. Missing-document warnings appear there",
            "Maintain a deadline tracker spreadsheet. You will lose track of something without one",
          ],
          callouts: [
            { tone: "info", body: "Many schools waive application fees for students from low-income or first-generation backgrounds. Always ask the admissions office before paying — fee waivers are rarely advertised but commonly granted." },
          ],
        },
      ],
    },
    {
      id: "stage-7",
      shortLabel: "Visa",
      title: "Visa & pre-departure",
      description: "After committing to a school, follow these steps in order. Don't skip ahead — each step depends on the previous one.",
      cards: [
        {
          id: "u7-i20",
          emoji: "📑",
          title: "I-20 & F-1 visa",
          subtitle: "Your school issues the I-20 once you commit. The I-20 makes you eligible to apply for the F-1 student visa.",
          bullets: [
            "Pay your enrolment deposit by May 1 (U.S. National Deposit Day) or the school's stated date",
            "Submit any financial documents the school requests — bank statements, sponsorship letters, scholarship awards",
            "Allow 1–4 weeks for the I-20 to arrive. Request the digital copy first; the physical copy follows by courier",
            "Verify every detail on the I-20: name, date of birth, programme dates, funding amount. Errors require re-issuance",
            "Sign and date the I-20 in blue ink as soon as it arrives, and photograph it as a backup",
          ],
        },
        {
          id: "u7-pre-departure",
          emoji: "✈️",
          title: "Pre-departure logistics",
          subtitle: "What to handle in the weeks before you fly.",
          bullets: [
            "Book flights so you arrive 5–10 days before orientation begins — gives you time to settle in",
            "Open a U.S.-friendly bank account in advance, or notify your home bank that you'll be using your card internationally",
            "Get a U.S. SIM card on arrival. Mint Mobile, US Mobile, and Tello are the cheapest options for students",
            "Pack only what's hard to buy in the U.S. Bedding, most clothes, and toiletries are easier and cheaper to buy locally",
            "Carry multiple copies of every important document: I-20, passport, admission letter, vaccination records",
          ],
        },
        {
          id: "u7-checklist",
          emoji: "📋",
          title: "Bachelor's document checklist",
          subtitle: "Tick each item as you complete it. Missing documents are the most common cause of stalled applications and visa interviews.",
          bullets: [],
          checklist: [
            { id: "transcript",      label: "Official high-school transcript (sealed copy + scanned PDF)" },
            { id: "passport",        label: "Valid passport (≥ 6 months past programme start date)" },
            { id: "sat-act",         label: "SAT or ACT score report (or test-optional confirmation)" },
            { id: "toefl",           label: "TOEFL / IELTS / Duolingo English score (where required)" },
            { id: "common-app",      label: "Common App / Coalition / school-direct application submitted" },
            { id: "personal-essay",  label: "Personal Statement (final draft, proofread)" },
            { id: "supplements",     label: "Supplemental essays for every school you applied to" },
            { id: "counsellor-rec",  label: "Counsellor recommendation submitted" },
            { id: "teacher-rec-1",   label: "Teacher recommendation #1 submitted" },
            { id: "teacher-rec-2",   label: "Teacher recommendation #2 submitted" },
            { id: "css-profile",     label: "CSS Profile (if applying for need-based aid)" },
            { id: "fee-waiver",      label: "Application fee paid or waiver confirmed" },
            { id: "deposit",         label: "Enrolment deposit paid by May 1" },
            { id: "fin-docs",        label: "Financial documents submitted for I-20" },
            { id: "i20",             label: "I-20 issued and signed in blue ink" },
            { id: "sevis",           label: "SEVIS I-901 receipt saved" },
            { id: "ds160",           label: "DS-160 confirmation page printed" },
            { id: "mrv",             label: "MRV visa application fee paid" },
            { id: "visa-interview",  label: "Visa interview completed" },
            { id: "visa",            label: "F-1 visa stamped on passport" },
            { id: "flight",          label: "Flight booked (arriving 5–10 days before orientation)" },
          ],
        },
      ],
    },
  ],
};

export function getRoadmapForLevel(level: string | undefined): Roadmap {
  const l = (level || "").toLowerCase();
  if (l.includes("master") || l.includes("phd") || l.includes("doctor") || l.includes("graduate") || l.includes("postgrad") || l.includes("mba")) {
    return POSTGRAD_ROADMAP;
  }
  return UNDERGRAD_ROADMAP;
}
