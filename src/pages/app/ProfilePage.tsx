import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, BadgeCheck, Camera, Check, ChevronDown, KeyRound, Loader2, LogOut, Mail, Plus, Settings, User, Wallet } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useAppData } from "../../hooks/useAppData";
import { TabScreen } from "../../components/layout/AppShell";
import { ScreenHeader, HeaderIconButton } from "../../components/layout/ScreenHeader";
import AppFooter from "../../components/layout/AppFooter";

// ─────────────────────────────────────────────────────────────────────────────
// Profile — avatar, display name, preferences, password reset, sign out.
// Sleek tab-screen shell: ScreenHeader with a wallet shortcut action; the
// explicit sign-out button in the footer works on every viewport.
// ─────────────────────────────────────────────────────────────────────────────

type ProfileFormStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type PasswordResetStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const LANGUAGE_OPTIONS = ["English (US)", "Spanish", "French"];
const NOTIFICATION_OPTIONS = ["All Notifications", "Important Updates Only", "None"];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { username, handleSignOut } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persisted state, loaded from users/{uid} on mount.
  const [photoURL, setPhotoURL]           = useState<string | null>(null);
  const [displayName, setDisplayName]     = useState<string>(username);
  const [language, setLanguage]           = useState<string>(LANGUAGE_OPTIONS[0]);
  const [notifPref, setNotifPref]         = useState<string>(NOTIFICATION_OPTIONS[0]);

  // Pending photo file kept locally until "Save All Changes" — that way users
  // can preview the avatar without paying the Storage write until they commit.
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);

  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState<ProfileFormStatus>({ kind: "idle" });
  const [pwStatus, setPwStatus] = useState<PasswordResetStatus>({ kind: "idle" });

  // Detect provider so we can tailor the password-reset action. Google /
  // Apple sign-in users don't have a Firebase password to reset; they must
  // go through their provider, so we surface a clear note instead.
  const providers: string[] = (user?.providerData ?? []).map((p: any) => p?.providerId).filter(Boolean);
  const hasPasswordAuth = providers.includes("password");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.uid) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          if (typeof data.displayName === "string" && data.displayName)   setDisplayName(data.displayName);
          if (typeof data.photoURL    === "string" && data.photoURL)      setPhotoURL(data.photoURL);
          if (typeof data.language    === "string" && data.language)      setLanguage(data.language);
          if (typeof data.notificationPref === "string" && data.notificationPref) setNotifPref(data.notificationPref);
        }
      } catch (err) {
        console.warn("Could not load profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Object URLs leak unless explicitly revoked. Wipe on file change or unmount.
  useEffect(() => {
    if (!pendingPhotoPreview) return;
    return () => URL.revokeObjectURL(pendingPhotoPreview);
  }, [pendingPhotoPreview]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", message: "Please choose an image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ kind: "error", message: "Image must be under 5 MB." });
      return;
    }
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
    setPendingPhotoFile(file);
    setPendingPhotoPreview(URL.createObjectURL(file));
    setStatus({ kind: "idle" });
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setStatus({ kind: "saving" });
    try {
      let nextPhotoURL = photoURL;
      if (pendingPhotoFile) {
        // Single fixed filename so re-uploads overwrite — keeps Storage tidy
        // and avoids needing to clean up old objects.
        const sref = storageRef(storage, `users/${user.uid}/profile/avatar`);
        await uploadBytes(sref, pendingPhotoFile, { contentType: pendingPhotoFile.type });
        nextPhotoURL = await getDownloadURL(sref);
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: displayName.trim() || null,
          photoURL: nextPhotoURL ?? null,
          language,
          notificationPref: notifPref,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (pendingPhotoFile) {
        setPhotoURL(nextPhotoURL);
        setPendingPhotoFile(null);
        if (pendingPhotoPreview) { URL.revokeObjectURL(pendingPhotoPreview); setPendingPhotoPreview(null); }
      }
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus(s => (s.kind === "saved" ? { kind: "idle" } : s)), 2500);
    } catch (err: any) {
      console.error("Profile save failed:", err);
      setStatus({ kind: "error", message: err?.message ?? "Could not save your changes." });
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setPwStatus({ kind: "sending" });
    try {
      await sendPasswordResetEmail(auth, user.email);
      setPwStatus({ kind: "sent" });
    } catch (err: any) {
      console.error("Password reset failed:", err);
      setPwStatus({ kind: "error", message: err?.message ?? "Could not send reset email." });
    }
  };

  const displayedAvatar = pendingPhotoPreview ?? photoURL;
  const headerName = (displayName?.trim() || username).trim();

  return (
    <TabScreen>
      <ScreenHeader
        eyebrow="Account"
        title="Your Profile"
        subtitle="Avatar, preferences, and security."
        action={
          <HeaderIconButton
            icon={<Wallet size={20} />}
            label="Open wallet"
            onClick={() => navigate("/app/billing")}
          />
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* Cover Banner & Profile Info Card */}
          <div className="bg-white rounded-card-lg shadow-card border border-slate-200/70 overflow-hidden">

            {/* Ink banner with signature decor */}
            <div className="h-32 md:h-40 bg-ink relative overflow-hidden">
              <div className="absolute -right-8 -top-12 w-40 h-40 rounded-full border-[18px] border-primary-500/20" aria-hidden />
              <div className="absolute right-16 top-4 w-40 h-40 rounded-full bg-primary-500/20 blur-3xl" aria-hidden />
            </div>

            {/* Profile Details Container */}
            <div className="px-6 md:px-10 pb-8 relative">

              {/* Overlapping Avatar */}
              <div className="absolute -top-16 left-6 md:left-10 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-32 h-32 rounded-card-lg bg-white flex items-center justify-center p-1.5 shadow-xl shadow-slate-900/10">
                  <div className="w-full h-full bg-slate-100 rounded-[26px] overflow-hidden flex items-center justify-center text-slate-400 relative">
                    {displayedAvatar ? (
                      <img src={displayedAvatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User size={48} />
                    )}

                    {/* Hover Camera Overlay */}
                    <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-sm">
                      <Camera size={24} />
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center text-white border-4 border-white shadow-sm transition-transform group-hover:scale-110">
                  <Plus size={16} />
                </div>
                <input type="file" ref={fileInputRef} onChange={handleImagePick} accept="image/*" className="hidden" />
              </div>

              {/* Name & Badge */}
              <div className="pt-20">
                <h2 className="text-3xl font-black text-slate-900 leading-tight mb-1">@{headerName}</h2>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 text-xs font-bold tracking-eyebrow uppercase border border-primary-100">
                    <BadgeCheck size={12} /> Free Plan
                  </span>
                  <span className="text-sm font-medium text-slate-500">{user?.email}</span>
                  {pendingPhotoFile && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">
                      Pending — Save to apply
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Personal Details Card */}
            <div className="bg-white rounded-card p-6 md:p-8 shadow-card border border-slate-200/70">
              <h3 className="text-sm font-black text-slate-900 mb-6 flex items-center gap-2">
                <User size={18} className="text-primary-500" /> Personal Details
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2 ml-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="Your Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2 ml-1">Email Address</label>
                  <input type="email" disabled value={user?.email || ""} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-500 focus:outline-none cursor-not-allowed" />
                </div>
              </div>
            </div>

            {/* App Preferences Card */}
            <div className="bg-white rounded-card p-6 md:p-8 shadow-card border border-slate-200/70">
              <h3 className="text-sm font-black text-slate-900 mb-6 flex items-center gap-2">
                <Settings size={18} className="text-primary-500" /> App Preferences
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2 ml-1">Notifications</label>
                  <div className="relative">
                    <select
                      value={notifPref}
                      onChange={(e) => setNotifPref(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all appearance-none cursor-pointer"
                    >
                      {NOTIFICATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-eyebrow text-slate-500 mb-2 ml-1">Language</label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all appearance-none cursor-pointer"
                    >
                      {LANGUAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Security card — password reset */}
          <div className="bg-white rounded-card p-6 md:p-8 shadow-card border border-slate-200/70">
            <h3 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2">
              <KeyRound size={18} className="text-primary-500" /> Security
            </h3>
            {hasPasswordAuth ? (
              <>
                <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                  We'll email a secure link to <span className="font-bold text-slate-700">{user?.email}</span>. Open it on the same device and choose a new password.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <button
                    onClick={handlePasswordReset}
                    disabled={pwStatus.kind === "sending" || pwStatus.kind === "sent"}
                    className="inline-flex items-center justify-center gap-2 bg-ink text-white font-bold py-3 px-5 rounded-full hover:bg-slate-800 transition-colors active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                  >
                    {pwStatus.kind === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    {pwStatus.kind === "sent" ? "Reset email sent" : pwStatus.kind === "sending" ? "Sending…" : "Send password reset email"}
                  </button>
                  {pwStatus.kind === "sent" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E7D32]">
                      <Check size={13} /> Check your inbox (and spam folder).
                    </span>
                  )}
                  {pwStatus.kind === "error" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                      <AlertTriangle size={13} /> {pwStatus.message}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 leading-relaxed">
                You signed in with {providers[0] === "google.com" ? "Google" : providers[0] === "apple.com" ? "Apple" : "a social provider"}. There's no separate College Ready password to reset — manage your account through {providers[0] === "google.com" ? "your Google account settings" : "your provider's account settings"}.
              </p>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-2">
            <div className="flex items-center gap-3 flex-1 w-full">
              <button
                onClick={handleSave}
                disabled={status.kind === "saving"}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-500 text-white font-bold py-4 px-10 rounded-full hover:bg-primary-600 transition-transform active:scale-[0.98] shadow-glow disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {status.kind === "saving" ? <Loader2 size={16} className="animate-spin" /> : null}
                {status.kind === "saving" ? "Saving…" : "Save all changes"}
              </button>
              {status.kind === "saved" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E7D32]">
                  <Check size={13} /> Saved
                </span>
              )}
              {status.kind === "error" && (
                <span className="inline-flex items-start gap-1.5 text-xs font-semibold text-rose-700 leading-relaxed">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {status.message}
                </span>
              )}
            </div>

            <button onClick={handleSignOut} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-rose-200 text-rose-600 font-bold py-4 px-8 rounded-full hover:bg-rose-50 transition-colors shadow-sm">
              <LogOut size={18} /> Sign out
            </button>
          </div>

        </motion.div>
      )}

      <AppFooter />
    </TabScreen>
  );
}
