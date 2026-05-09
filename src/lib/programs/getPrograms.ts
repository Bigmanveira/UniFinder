import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { StudentProfile } from "../../types";

// IMPORTANT: keep these two normalisers in sync with
// functions/src/index.ts (normaliseProfileField / normaliseCredentialLevel).
// The backend re-runs the same gate at unlock time.

export function normaliseProfileField(fieldRaw: string): string | null {
  const f = fieldRaw.toLowerCase().trim();
  if (!f) return null;
  if (f.includes("computer science"))        return "computer_science";
  if (f.includes("data science"))            return "data_science";
  if (f.includes("information system"))      return "information_systems";
  if (f.includes("information science"))     return "information_systems";
  if (f.includes("cyber"))                   return "cybersecurity";
  if (f.includes("software engineering"))    return "computer_science";
  if (f.includes("computing"))               return "computer_science";
  if (f.includes("computer engineering"))    return "computer_science";
  if (f.includes("business analytics"))      return "business_analytics";
  if (f.includes("business administration")) return "business_administration";
  if (f.includes("mba"))                     return "business_administration";
  if (f.includes("electrical engineering"))  return "electrical_engineering";
  if (f.includes("mechanical engineering")) return "mechanical_engineering";
  return null;
}

export function normaliseCredentialLevel(levelRaw: string): string | null {
  const l = levelRaw.toLowerCase().trim();
  if (!l) return null;
  if (l.includes("phd") || l.includes("doctorate") || l.includes("doctoral")) return "doctoral";
  if (l.includes("master") || l.includes("mba") || l.includes("postgrad"))    return "masters";
  if (l.includes("bachelor") || l.includes("undergraduate"))                  return "undergraduate";
  if (l.includes("certificate"))                                              return "certificate";
  return null;
}

export interface ProgramGateResult {
  // null  = gate not enforceable (field or level not recognised) — fall back to heuristics
  // Set   = the only schools allowed through. Empty Set means "no school in the DB
  //         has a verified program for this combo" — UI must surface this clearly.
  eligibleUnitIds: Set<string> | null;
  normalisedField: string | null;
  normalisedLevel: string | null;
}

export async function getEligibleUnitIds(profile: StudentProfile): Promise<ProgramGateResult> {
  const rawField = (profile.field || profile.intendedMajor || "").trim();
  const rawLevel = (profile.level || profile.degreeLevel || profile.targetDegreeLevel || "").trim();

  const normalisedField = normaliseProfileField(rawField);
  const normalisedLevel = normaliseCredentialLevel(rawLevel);

  if (!normalisedField || !normalisedLevel) {
    return { eligibleUnitIds: null, normalisedField, normalisedLevel };
  }

  const programsRef = collection(db, "programs");
  const q = query(
    programsRef,
    where("normalizedField", "==", normalisedField),
    where("credentialLevel", "==", normalisedLevel),
    where("status", "==", "active"),
  );

  const snapshot = await getDocs(q);
  const eligibleUnitIds = new Set<string>();
  snapshot.forEach((doc) => {
    const unitId = doc.data().unitId;
    if (unitId !== undefined && unitId !== null) {
      eligibleUnitIds.add(String(unitId));
    }
  });

  return { eligibleUnitIds, normalisedField, normalisedLevel };
}
