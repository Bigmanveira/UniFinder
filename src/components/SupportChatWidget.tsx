import { useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { Link, useLocation } from "react-router-dom";
import {
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import { functions } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";

type ChatRole = "user" | "assistant";

interface ChatSource {
  label: string;
  path: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  suggestedQuestions?: string[];
}

interface SupportChatPayload {
  message: string;
  history: Array<{ role: ChatRole; content: string }>;
  route: string;
}

interface SupportChatResult {
  answer: string;
  confidence: "high" | "medium" | "low";
  needsHuman: boolean;
  sources: ChatSource[];
  suggestedQuestions: string[];
}

const STORAGE_KEY = "college-ready-support-chat-v1";
const DEFAULT_TEMPLATES = [
  "How do credits work?",
  "How does school matching work?",
  "What do I need for the visa interview?",
  "How do I contact support?",
];

const ROUTE_TEMPLATES: Array<{ match: (path: string) => boolean; questions: string[] }> = [
  {
    match: (path) => path === "/pricing" || path === "/app",
    questions: [
      "Which credit pack should I choose?",
      "What does each feature cost?",
      "My purchased credits are missing. What should I do?",
      "Do credits expire?",
    ],
  },
  {
    match: (path) => path.startsWith("/app/visa-interview"),
    questions: [
      "How does the free interview preview work?",
      "Which documents do I need?",
      "Which browsers support voice mode?",
      "Will I get a scored report?",
    ],
  },
  {
    match: (path) => path.startsWith("/app/cv-studio"),
    questions: [
      "What can CV Studio do?",
      "How much does each CV tool cost?",
      "Is there a free CV preview?",
      "Where are my previous CV documents?",
    ],
  },
  {
    match: (path) => path.startsWith("/app/roadmap"),
    questions: [
      "How does the roadmap work?",
      "Does the roadmap use credits?",
      "Can I update my current stage?",
      "Will rerunning onboarding erase my progress?",
    ],
  },
  {
    match: (path) => path === "/login" || path === "/signup",
    questions: [
      "How do I sign in?",
      "My email sign-in link is not working.",
      "Why was I signed out?",
      "I may have duplicate accounts.",
    ],
  },
  {
    match: (path) => path === "/results" || path.startsWith("/app/reports"),
    questions: [
      "How are Reach, Target, and Safety decided?",
      "What does a match report cost?",
      "Why are some categories locked?",
      "Do match results guarantee admission?",
    ],
  },
];

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readStoredMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ChatMessage =>
        !!item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
      )
      .slice(-20);
  } catch {
    return [];
  }
}

function sourceIsInternal(path: string): boolean {
  return path.startsWith("/");
}

function getFunctionErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return "code" in error ? String(error.code) : "";
}

function supportErrorMessage(error: unknown): string {
  const code = getFunctionErrorCode(error);
  if (code === "functions/resource-exhausted" || code === "resource-exhausted") {
    return "You have sent several messages quickly. Please wait a moment and try again.";
  }
  if (code === "functions/not-found" || code === "not-found") {
    return "The support service is not deployed for this environment yet. Contact support@collegeready.io if you need help now.";
  }
  if (
    code === "functions/unavailable" ||
    code === "unavailable" ||
    code === "functions/deadline-exceeded" ||
    code === "deadline-exceeded"
  ) {
    return "The support service is temporarily unavailable. Please retry in a moment.";
  }
  return "I couldn't reach support right now. Try again, or contact support@collegeready.io for help.";
}

export default function SupportChatWidget() {
  const location = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(readStoredMessages);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const templateQuestions = useMemo(
    () => ROUTE_TEMPLATES.find(({ match }) => match(location.pathname))?.questions ?? DEFAULT_TEMPLATES,
    [location.pathname],
  );

  const latestSuggestions = useMemo(() => {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    return latestAssistant?.suggestedQuestions?.length
      ? latestAssistant.suggestedQuestions
      : templateQuestions;
  }, [messages, templateQuestions]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    } catch {
      // Session storage can be unavailable in hardened/private browser modes.
    }
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const clearConversation = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort only.
    }
  };

  const sendMessage = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || sending) return;

    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [
      ...current,
      { id: createId(), role: "user", content: message },
    ]);
    setInput("");
    setSending(true);

    try {
      const callSupport = httpsCallable<SupportChatPayload, SupportChatResult>(
        functions,
        "supportChat",
        { timeout: 45_000 },
      );
      const result = await callSupport({
        message,
        history,
        route: location.pathname,
      });
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: result.data.answer,
          sources: result.data.sources,
          suggestedQuestions: result.data.suggestedQuestions,
        },
      ]);
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.warn("[supportChat] callable failed", error);
      }
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: supportErrorMessage(error),
          sources: [{ label: "Contact support", path: "/contact" }],
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[90] font-sans sm:bottom-6 sm:right-6">
      {open && (
        <section
          aria-label="College Ready support assistant"
          className="mb-3 flex h-[min(680px,calc(100vh-6.5rem))] w-[calc(100vw-2rem)] max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
        >
          <header className="flex items-center justify-between bg-slate-950 px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-500">
                <MessageCircle size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black">College Ready Support</h2>
                <p className="truncate text-[11px] font-medium text-slate-400">
                  App help and verified FAQs
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearConversation}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Clear support conversation"
                  title="Clear conversation"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close support assistant"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-slate-50 px-3.5 py-4">
            <div className="mb-4 rounded-2xl border border-primary-100 bg-white p-3.5 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2 text-primary-700">
                <ShieldCheck size={15} />
                <span className="text-[11px] font-black uppercase tracking-wider">Grounded support</span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-slate-600">
                Ask about College Ready features, credits, billing, accounts, or troubleshooting.
                I only answer from verified app information.
              </p>
              {!user && (
                <p className="mt-2 text-[11px] font-semibold text-slate-400">
                  I can explain account steps, but I cannot inspect an account or payment.
                </p>
              )}
            </div>

            {messages.length === 0 && (
              <div className="mb-4">
                <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Try asking
                </p>
                <div className="grid gap-2">
                  {templateQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void sendMessage(question)}
                      className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left text-[13px] font-bold leading-snug text-slate-700 shadow-sm transition-all hover:border-primary-300 hover:text-primary-700 hover:shadow-md"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                      <MessageCircle size={14} />
                    </div>
                  )}
                  <div className={`max-w-[82%] ${message.role === "user" ? "order-first" : ""}`}>
                    <div
                      className={
                        message.role === "user"
                          ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary-600 px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-white"
                          : "whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-slate-700 shadow-sm"
                      }
                    >
                      {message.content}
                    </div>
                    {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {message.sources.map((source) =>
                          sourceIsInternal(source.path) ? (
                            <Link
                              key={`${message.id}-${source.path}`}
                              to={source.path}
                              onClick={() => setOpen(false)}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-primary-100 hover:text-primary-700"
                            >
                              {source.label} <ExternalLink size={9} />
                            </Link>
                          ) : (
                            <a
                              key={`${message.id}-${source.path}`}
                              href={source.path}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-primary-100 hover:text-primary-700"
                            >
                              {source.label} <ExternalLink size={9} />
                            </a>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                      <User size={14} />
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                    <MessageCircle size={14} />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-500 shadow-sm">
                    <Loader2 size={14} className="animate-spin" /> Checking verified app information
                  </div>
                </div>
              )}
            </div>

            {messages.length > 0 && !sending && latestSuggestions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Suggested questions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {latestSuggestions.slice(0, 3).map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void sendMessage(question)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-primary-300 hover:text-primary-700"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
            className="border-t border-slate-200 bg-white p-3"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 1200))}
                placeholder="Ask a College Ready question..."
                className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[13px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
                aria-label="Support question"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send support question"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
            <p className="mt-2 px-1 text-center text-[10px] font-medium text-slate-400">
              Don't share passwords, card details, sign-in links, or document contents.
            </p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="ml-auto flex h-14 items-center gap-2 rounded-full bg-slate-950 px-4 text-white shadow-xl shadow-slate-900/25 transition-all hover:-translate-y-0.5 hover:bg-primary-700"
        aria-label={open ? "Close support assistant" : "Open support assistant"}
        aria-expanded={open}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span className="text-sm font-black">{open ? "Close" : "Ask support"}</span>
      </button>
    </div>
  );
}
