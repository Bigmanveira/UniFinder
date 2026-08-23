import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { AlertTriangle, LogOut, ShieldAlert } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { db } from "../lib/firebase";
import { signOutWithAudit } from "../lib/userAudit";
import SplashScreen from "./SplashScreen";
import BrandLogo from "./BrandLogo";
import { Eyebrow } from "./ui/Eyebrow";

type AccountStatus = "active" | "restricted" | "deactivated" | "deleted";

interface AccountState {
  uid: string;
  status: AccountStatus;
  reason: string | null;
}

export function AccountStatusGate() {
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountState | null>(null);
  const [errorUid, setErrorUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        const data = snapshot.data();
        const value = data?.accountStatus;
        const status: AccountStatus =
          value === "restricted" || value === "deactivated" || value === "deleted"
            ? value
            : "active";
        setAccount({
          uid: user.uid,
          status,
          reason: typeof data?.accountStatusReason === "string"
            ? data.accountStatusReason
            : null,
        });
        setErrorUid(null);
      },
      () => {
        setErrorUid(user.uid);
      },
    );
  }, [user]);

  if (user && errorUid === user.uid) {
    return (
      <AccountUnavailable
        title="We could not verify your account"
        message="Access is paused until your account status can be verified. Please retry or contact support."
        warning
      />
    );
  }

  if (!user || !account || account.uid !== user.uid) {
    return <SplashScreen />;
  }

  if (account.status === "active") return <Outlet />;

  const title = account.status === "restricted"
    ? "Your account is restricted"
    : account.status === "deactivated"
      ? "Your account is deactivated"
      : "This account is no longer available";

  return (
    <AccountUnavailable
      title={title}
      message={account.reason ?? "Contact support if you believe this is an error."}
      warning={account.status === "restricted"}
    />
  );
}

function AccountUnavailable({
  title,
  message,
  warning,
}: {
  title: string;
  message: string;
  warning: boolean;
}) {
  // Dark ink hero card centered on bg-surface — sibling of NotFoundPage.
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-5">
      <section className="relative w-full max-w-lg bg-ink text-white rounded-card-lg overflow-hidden shadow-2xl p-8 sm:p-12 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full border-[22px] border-primary-500/15" />
          <div className="absolute -left-16 -bottom-20 w-56 h-56 rounded-full bg-primary-500/15 blur-3xl" />
        </div>
        <div className="relative flex flex-col items-center">
          <BrandLogo size="md" tone="light" iconOnly asLink={false} className="mb-6" />
          <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
            warning ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"
          }`}>
            {warning ? <AlertTriangle size={22} /> : <ShieldAlert size={22} />}
          </div>
          <Eyebrow tone="light" className="mb-2">Account status</Eyebrow>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">{title}</h1>
          <p className="text-sm text-white/60 font-medium leading-relaxed max-w-sm">{message}</p>
          <p className="mt-4 text-xs font-medium text-white/50">
            Support: <a className="font-bold text-primary-300 hover:text-primary-200" href="mailto:support@collegeready.io">support@collegeready.io</a>
          </p>
          <button
            type="button"
            onClick={() => void signOutWithAudit()}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 px-7 py-3.5 text-sm font-bold text-white shadow-glow transition-all active:scale-95"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
