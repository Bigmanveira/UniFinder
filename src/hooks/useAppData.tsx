import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { signOutWithAudit } from "../lib/userAudit";
import { subscribeStudyRoadmap } from "../lib/roadmap/roadmapClient";
import type { StudyRoadmap } from "../lib/roadmap/studyAbroad";
import { isFounderEmail } from "../lib/founders";

// ─────────────────────────────────────────────────────────────────────────────
// AppDataProvider — the live per-user data that the app shell and its pages
// share: wallet, reports, saved schools, profile doc, roadmap. One set of
// listeners feeds the greeting, the tab screens, and every converted page
// instead of five separate subscription blocks.
// Mounted by AppShell, so it only exists inside authed shell routes.
// ─────────────────────────────────────────────────────────────────────────────

interface UserProfile {
  displayName?: string;
  photoURL?: string;
}

interface AppData {
  credits: number;
  isFounder: boolean;
  matchReports: any[];
  interviewReports: any[];
  savedSchools: any[];
  studyRoadmap: StudyRoadmap | null;
  studyRoadmapLoaded: boolean;
  userProfile: UserProfile | null;
  /** Saved display name, else the email handle. */
  username: string;
  avatarURL: string | null;
  handleSignOut: () => Promise<void>;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Founders run the app with unlimited credits for product testing.
  // The wallet UI shows "∞" instead of the literal balance for these
  // accounts; the backend bypasses credit deduction for the same emails.
  const isFounder = isFounderEmail(user?.email);

  const [credits, setCredits] = useState<number>(0);
  const [matchReports, setMatchReports] = useState<any[]>([]);
  const [interviewReports, setInterviewReports] = useState<any[]>([]);
  const [savedSchools, setSavedSchools] = useState<any[]>([]);
  const [studyRoadmap, setStudyRoadmap] = useState<StudyRoadmap | null>(null);
  const [studyRoadmapLoaded, setStudyRoadmapLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubCredits = onSnapshot(doc(db, "creditWallets", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.credits === "number") {
          setCredits(data.credits);
        }
      } else {
        // Wallet not yet created — new users start with 2 free credits.
        // The wallet document is created by the Cloud Function on first
        // paid action (match unlock or visa interview). Keep this number
        // in sync with FREE_CREDITS_ON_SIGNUP in functions/src/index.ts.
        setCredits(2);
      }
    });

    const qReports = query(collection(db, "matchReports"), where("userId", "==", user.uid));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      const reports: any[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort in memory since we might not have an index for orderBy("createdAt", "desc") yet
      reports.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setMatchReports(reports);
    });

    const qInterviews = query(collection(db, "visaInterviewReports"), where("userId", "==", user.uid));
    const unsubInterviews = onSnapshot(qInterviews, (snapshot) => {
      const reports: any[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      reports.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setInterviewReports(reports);
    });

    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setUserProfile({
          displayName: typeof data.displayName === "string" ? data.displayName : undefined,
          photoURL: typeof data.photoURL === "string" ? data.photoURL : undefined,
        });
      } else {
        setUserProfile(null);
      }
    });

    const unsubSaved = onSnapshot(doc(db, "savedSchools", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSavedSchools(data.schools || []);
      } else {
        setSavedSchools([]);
      }
    });

    // Study Abroad Roadmap — null while loading, then either the roadmap doc
    // or null (= user has never onboarded).
    const unsubRoadmap = subscribeStudyRoadmap(
      user.uid,
      (rm) => { setStudyRoadmap(rm); setStudyRoadmapLoaded(true); },
      () => { setStudyRoadmapLoaded(true); }, // silent — degrade to "no roadmap" UI
    );

    return () => {
      unsubCredits();
      unsubReports();
      unsubInterviews();
      unsubProfile();
      unsubSaved();
      unsubRoadmap();
    };
  }, [user]);

  const handleSignOut = useCallback(async () => {
    // signOutWithAudit writes a user_sign_out event to /userAuditLogs first,
    // then resolves the actual Firebase signOut. Audit failure is swallowed
    // inside the helper so a Firestore hiccup can never block sign-out.
    await signOutWithAudit();
    navigate("/");
  }, [navigate]);

  const emailHandle = user?.email ? user.email.split("@")[0] : "Student";
  const username = userProfile?.displayName?.trim() || emailHandle;
  const avatarURL = userProfile?.photoURL ?? null;

  // Memoized so consumers only re-render when a value they read actually
  // changed — six live Firestore listeners feed this provider, and a fresh
  // object identity per render was cascading every snapshot into a full
  // shell + screen re-render on mobile.
  const value = useMemo<AppData>(
    () => ({
      credits,
      isFounder,
      matchReports,
      interviewReports,
      savedSchools,
      studyRoadmap,
      studyRoadmapLoaded,
      userProfile,
      username,
      avatarURL,
      handleSignOut,
    }),
    [credits, isFounder, matchReports, interviewReports, savedSchools,
     studyRoadmap, studyRoadmapLoaded, userProfile, username, avatarURL, handleSignOut],
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider (AppShell routes)");
  return ctx;
}
