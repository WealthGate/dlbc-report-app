import { doc, runTransaction } from "firebase/firestore";

// Migrate legacy rows together and use stable ids so a retried save cannot duplicate a row.
export async function persistMonthlyExpenses({ db, countryKey, country, month, email,
  rows, baseline, legacyRows = [], summaryRevision = "", deleteId = "" }) {
  if (!rows.length && !legacyRows.length && !deleteId) return [];
  const pending = new Map(legacyRows.map(row => [row.localId, row]));
  rows.forEach(row => pending.set(row.localId, row));
  if (deleteId) pending.delete(deleteId);
  const now = new Date().toISOString();
  const entries = [...pending.values()].map(row => ({
    ...row, id: row.id || `${countryKey}__${month}__${row.localId}`,
    createdAt: row.createdAt || now, updatedAt: now, savedBy: email
  }));
  if (entries.length > 450) throw new Error("Save fewer than 450 expense rows at a time.");
  await runTransaction(db, async transaction => {
    const summaryRef = doc(db, "monthly_summaries", `${countryKey}__${month}`);
    const summary = await transaction.get(summaryRef);
    if (legacyRows.length && ((summary.data()?.updatedAt || "") !== summaryRevision || summary.data()?.expenseRegisterInitialized)) {
      throw new Error("These legacy expenses were changed by another user. Reload before saving.");
    }
    const existingIds = [...new Set([...entries.map(row => row.id), deleteId].filter(id => baseline.has(id)))];
    const existing = await Promise.all(existingIds.map(id => transaction.get(doc(db, "monthly_expense_records", id))));
    existing.forEach((snapshot, index) => {
      const original = baseline.get(existingIds[index]);
      if (!snapshot.exists() || (snapshot.data().updatedAt || "") !== (original.updatedAt || "")) {
        throw new Error("An expense was changed or deleted by another user. Copy your unsaved edits and reload before saving.");
      }
    });
    entries.forEach(row => transaction.set(doc(db, "monthly_expense_records", row.id), {
      month, country, countryKey, date: row.date, purpose: row.purpose,
      otherDetails: row.otherDetails?.trim() || "", amount: row.amount,
      createdAt: row.createdAt, updatedAt: now, savedBy: email
    }));
    if (deleteId && baseline.has(deleteId)) transaction.delete(doc(db, "monthly_expense_records", deleteId));
    transaction.set(summaryRef, { month, country, countryKey,
      expenseRegisterInitialized: true, monthlyExpenses: [] }, { merge: true });
  });
  return entries;
}
