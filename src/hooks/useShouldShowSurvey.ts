// useShouldShowSurvey — decides whether to surface the feedback
// survey modal for a given user RIGHT NOW.
//
// Rules:
//   1. Must be authenticated (anonymous guests can't be surveyed).
//   2. No /surveyResponses entry written within the last 14 days
//      (skips count — a skip is the user saying "not now", which we
//      honour for the same window).
//   3. A 50% probability gate INSIDE the eligibility window so the
//      prompt doesn't appear on every completion event. Stops it
//      from feeling mechanical when a user finishes 3 reports in a
//      row right after their cooldown expires.
//
// The hook fires a single Firestore read per mount. Eligibility
// resolves to `false` until we're certain — never `true` while loading
// so we don't flash the modal then dismiss it.

import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";

const COOLDOWN_DAYS    = 14;
const COOLDOWN_MS      = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
// Probability of showing the prompt when otherwise eligible. 0.5 →
// expected one prompt per two qualifying completions. The 14-day
// cooldown is the floor; this layer just smooths the timing.
const SHOW_PROBABILITY = 0.5;

interface State {
  loading:    boolean;
  shouldShow: boolean;
}

export function useShouldShowSurvey(): State {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ loading: true, shouldShow: false });

  useEffect(() => {
    if (!user) {
      setState({ loading: false, shouldShow: false });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "surveyResponses"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(1),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        let eligible = true;
        if (!snap.empty) {
          const lastCreatedAt: any = snap.docs[0].data()?.createdAt;
          const lastMs = lastCreatedAt?.toMillis?.()
            ?? (typeof lastCreatedAt?.seconds === "number" ? lastCreatedAt.seconds * 1000 : 0);
          if (Date.now() - lastMs < COOLDOWN_MS) {
            eligible = false;
          }
        }

        // Apply the probability gate ONLY when otherwise eligible.
        // We use a per-eligibility-check random — that means a user
        // who finishes 5 reports in a single day has 5 independent
        // 50% draws (so ~97% chance of being prompted by the fifth).
        // Acceptable: after they're prompted (and submit or skip),
        // the cooldown kicks in and they won't see another prompt
        // for 14 days regardless.
        const shouldShow = eligible && Math.random() < SHOW_PROBABILITY;

        setState({ loading: false, shouldShow });
      } catch (err) {
        // On query failure (rules block, network drop), default to
        // "don't show" — never want a broken state to put a modal
        // in front of a user.
        console.warn("[useShouldShowSurvey] eligibility query failed:", err);
        if (!cancelled) setState({ loading: false, shouldShow: false });
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return state;
}
