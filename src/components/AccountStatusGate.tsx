import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { AlertTriangle, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { db } from "../lib/firebase";
import { signOutWithAudit } from "../lib/userAudit";

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
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
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
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12 flex items-center justify-center">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
          warning ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
        }`}>
          {warning ? <AlertTriangle size={26} /> : <ShieldAlert size={26} />}
        </div>
        <h1 className="text-2xl font-black text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <p className="mt-4 text-xs text-slate-500">
          Support: <a className="font-bold text-primary-600" href="mailto:support@unifinder.app">support@unifinder.app</a>
        </p>
        <button
          type="button"
          onClick={() => void signOutWithAudit()}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </section>
    </div>
  );
}
