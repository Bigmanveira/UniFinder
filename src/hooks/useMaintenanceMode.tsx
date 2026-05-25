// useMaintenanceMode — live subscription to the /appConfig/runtime
// kill-switch doc, with admin bypass detection.
//
// Combined into a single hook so callers (MaintenanceGate, anything
// that wants to display a banner) don't have to coordinate two
// separate subscriptions. The auth-state listener feeds in via the
// existing AuthProvider; the admin claim is read from the ID token
// once per user change.
//
// Return shape:
//   loading       — initial Firestore round-trip is in flight; gate
//                   should defer rendering rather than flash either
//                   way.
//   isMaintenance — the runtime config says we're in maintenance.
//   message       — admin-supplied headline (may be empty).
//   etaMs         — admin-supplied target time for "We'll be back
//                   in …" countdown; null when not set.
//   isAdmin       — current user carries the `admin: true` custom
//                   claim and should bypass the gate.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";

interface MaintenanceState {
  loading:       boolean;
  isMaintenance: boolean;
  message:       string;
  etaMs:         number | null;
  isAdmin:       boolean;
}

const CONFIG_PATH = ["appConfig", "runtime"] as const;

function readEtaMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof (value as any).toDate === "function") {
    return (value as any).toDate().getTime();
  }
  if (typeof (value as any).seconds === "number") {
    return (value as any).seconds * 1000;
  }
  return null;
}

export function useMaintenanceMode(): MaintenanceState {
  const { user } = useAuth();
  const [config, setConfig] = useState<{
    loading:       boolean;
    isMaintenance: boolean;
    message:       string;
    etaMs:         number | null;
  }>({ loading: true, isMaintenance: false, message: "", etaMs: null });
  const [isAdmin, setIsAdmin] = useState(false);

  // Snapshot subscription to the config doc. Real-time so flipping
  // maintenance on from the ops portal takes effect for users within
  // ~1 second without them needing to refresh.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...CONFIG_PATH), (snap) => {
      if (!snap.exists()) {
        setConfig({ loading: false, isMaintenance: false, message: "", etaMs: null });
        return;
      }
      const data = snap.data() ?? {};
      setConfig({
        loading:       false,
        isMaintenance: data.maintenanceMode === true,
        message:       typeof data.maintenanceMessage === "string" ? data.maintenanceMessage : "",
        etaMs:         readEtaMs(data.maintenanceEta),
      });
    }, (err) => {
      // Fail-open: a Firestore error on the listener shouldn't
      // accidentally lock everyone out. Surface to console for ops
      // but treat as "not in maintenance".
      // eslint-disable-next-line no-console
      console.warn("[maintenance] config listener error:", err);
      setConfig({ loading: false, isMaintenance: false, message: "", etaMs: null });
    });
    return () => unsub();
  }, []);

  // Read the admin custom claim from the ID token whenever auth
  // changes. Cached in state so the gate doesn't have to await
  // every render.
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let cancelled = false;
    user.getIdTokenResult().then((r) => {
      if (!cancelled) setIsAdmin(r.claims.admin === true);
    }).catch(() => {
      if (!cancelled) setIsAdmin(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  return {
    loading:       config.loading,
    isMaintenance: config.isMaintenance,
    message:       config.message,
    etaMs:         config.etaMs,
    isAdmin,
  };
}
