import { doc, runTransaction } from "firebase/firestore";

export const STAFF_ROLES = ["user", "finance_reporter", "admin", "vetting_committee_chairman"];
export const profileRevision = (profile) => JSON.stringify([
  profile.displayName || "", profile.branch || "", profile.role || "",
  profile.phone || "", profile.email || "", profile.countryKey || "", profile.updatedAt || ""
]);

export async function saveStaffProfile({ db, original, changes, countryKey, actorUid }) {
  const displayName = String(changes.displayName || "").trim();
  const branch = String(changes.branch || "").trim();
  const phone = String(changes.phone || "").trim();
  if (!displayName || displayName.length > 120) throw new Error("Enter a name of 1–120 characters.");
  if (!branch || branch.length > 120) throw new Error("Select a valid location.");
  if (phone.length > 60) throw new Error("The phone number is too long.");
  if (!STAFF_ROLES.includes(changes.role)) throw new Error("Select a valid role.");
  if (original.id === actorUid && changes.role !== "admin") throw new Error("You cannot remove your own administrator access.");
  const ref = doc(db, "users", original.id);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists()) throw new Error("This user profile no longer exists. Reload the list.");
    if (current.data().countryKey !== countryKey) throw new Error("This user belongs to a different country.");
    if (profileRevision(current.data()) !== profileRevision(original)) throw new Error("This profile changed while you were editing. Close the editor and reopen it to review the saved changes.");
    transaction.update(ref, { displayName, branch, phone, role: changes.role,
      updatedAt: new Date().toISOString(), updatedBy: actorUid });
  });
}

export function buildAccountInformation(profile) {
  return ["DLBC Reporting account", `Name: ${profile.displayName || "—"}`,
    `Sign-in email: ${profile.email || "—"}`, `Location: ${profile.branch || "—"}`,
    `Country: ${profile.country || "—"}`, `Role: ${(profile.role || "user").replaceAll("_", " ")}`,
    "Sign in: https://dlbcdom.web.app", "Forgot your password? Use Forgot password on the sign-in screen, or ask an administrator to send a reset email.",
    "Passwords are private and cannot be retrieved by an administrator."].join("\n");
}
