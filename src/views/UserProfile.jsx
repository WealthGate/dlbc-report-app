import React, { useEffect, useState } from "react";
import { collection, doc, getDocs, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { updatePassword } from "firebase/auth";
import { User } from "lucide-react";
import {
  buildReportKey,
  Button,
  Card,
  formatRoleLabel,
  getBranchLabel,
  getServiceLabel,
  InputGroup,
  normalizeCountryKey,
  parseReportDate
} from "./viewShared";

export default function UserProfile({ userProfile, db, auth }) {
  const [passwords, setPasswords] = useState({ new: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState(userProfile?.country || "");
  const [savingCountry, setSavingCountry] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState("");
  const [backfillingReportKeys, setBackfillingReportKeys] = useState(false);
  const [backfillReportKeyMessage, setBackfillReportKeyMessage] = useState("");
  const [loadingAllReports, setLoadingAllReports] = useState(false);
  const [allReports, setAllReports] = useState([]);
  const [allReportsError, setAllReportsError] = useState("");
  const [allReportsMonth, setAllReportsMonth] = useState("2025-12");
  const shiftMonth = (value, delta) => {
    if (!value || !value.includes("-")) return value;
    const [yearStr, monthStr] = value.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return value;
    const d = new Date(year, month - 1 + delta, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };

  useEffect(() => {
    setCountry(userProfile?.country || "");
  }, [userProfile]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      alert("Passwords do not match");
      return;
    }
    if (passwords.new.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(auth.currentUser, passwords.new);
      alert("Password updated successfully.");
      setPasswords({ new: "", confirm: "" });
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCountryUpdate = async (e) => {
    e.preventDefault();
    if (!country.trim()) {
      alert("Please enter a country.");
      return;
    }
    setSavingCountry(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        country: country.trim(),
        countryKey: normalizeCountryKey(country)
      });
      alert("Country updated.");
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSavingCountry(false);
    }
  };

  const handleBackfillReports = async () => {
    if (!userProfile?.role || userProfile.role !== "admin") return;
    const countryLabel = (userProfile?.country || "").trim();
    if (!countryLabel) {
      alert("Please set your country before running the backfill.");
      return;
    }
    const confirmed = window.confirm(
      `This will fill missing country/countryKey on legacy reports. Missing values will be set to "${countryLabel}" where needed. Continue?`
    );
    if (!confirmed) return;

    setBackfilling(true);
    setBackfillMessage("");
    try {
      const candidates = new Map();
      const collect = (snap) => {
        snap.forEach((d) => {
          candidates.set(d.id, { id: d.id, ...d.data() });
        });
      };

      const qMissingKey = query(
        collection(db, "reports"),
        where("countryKey", "==", null)
      );
      const qMissingCountry = query(
        collection(db, "reports"),
        where("country", "==", null)
      );
      const qEmptyCountry = query(
        collection(db, "reports"),
        where("country", "==", "")
      );

      const [snapKey, snapCountry, snapEmpty] = await Promise.all([
        getDocs(qMissingKey),
        getDocs(qMissingCountry),
        getDocs(qEmptyCountry)
      ]);

      collect(snapKey);
      collect(snapCountry);
      collect(snapEmpty);

      const updates = Array.from(candidates.values()).map((r) => {
        const resolvedCountry = (r.country || "").trim() || countryLabel;
        const payload = {};
        if (!r.country || !String(r.country).trim()) payload.country = resolvedCountry;
        if (!r.countryKey || !String(r.countryKey).trim()) {
          payload.countryKey = normalizeCountryKey(resolvedCountry);
        }
        return { id: r.id, payload };
      }).filter((item) => Object.keys(item.payload).length > 0);

      const BATCH_SIZE = 400;
      let updated = 0;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        updates.slice(i, i + BATCH_SIZE).forEach((item) => {
          batch.update(doc(db, "reports", item.id), item.payload);
        });
        await batch.commit();
        updated += Math.min(BATCH_SIZE, updates.length - i);
      }

      setBackfillMessage(
        updates.length
          ? `Backfill complete. Updated ${updated} report(s).`
          : "No legacy reports found to backfill."
      );
    } catch (e) {
      console.error("Backfill error:", e);
      setBackfillMessage(`Backfill failed: ${e.message}`);
    } finally {
      setBackfilling(false);
    }
  };

  const handleBackfillReportKeys = async () => {
    if (!userProfile?.role || userProfile.role !== "admin") return;
    const countryKey = userProfile?.countryKey || normalizeCountryKey(userProfile?.country || "");
    if (!countryKey) {
      alert("Please set your country before running the report key migration.");
      return;
    }
    const confirmed = window.confirm(
      "This will migrate existing reports to the new duplicate-safe IDs (country + date + location + service). " +
        "If a duplicate already exists, the older entry will be skipped to avoid data loss. Continue?"
    );
    if (!confirmed) return;

    setBackfillingReportKeys(true);
    setBackfillReportKeyMessage("");
    try {
      const snap = await getDocs(
        query(collection(db, "reports"), where("countryKey", "==", countryKey))
      );
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const idSet = new Set(reports.map((r) => r.id));

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let duplicates = 0;
      let deleted = 0;

      const BATCH_SIZE = 380;
      let batch = writeBatch(db);
      let ops = 0;

      const commitBatch = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };

      for (const r of reports) {
        const computedKey = buildReportKey({
          countryKey: r.countryKey || countryKey,
          date: r.date,
          serviceType: r.serviceType,
          otherServiceType: r.otherServiceType,
          branch: r.branch,
          otherBranch: r.otherBranch
        });

        if (r.id === computedKey) {
          if (r.reportKey !== computedKey) {
            batch.update(doc(db, "reports", r.id), { reportKey: computedKey });
            updated += 1;
            ops += 1;
          } else {
            skipped += 1;
          }
          if (ops >= BATCH_SIZE) await commitBatch();
          continue;
        }

        if (idSet.has(computedKey)) {
          duplicates += 1;
          if (r.reportKey !== computedKey) {
            batch.update(doc(db, "reports", r.id), { reportKey: computedKey });
            updated += 1;
            ops += 1;
          }
          if (ops >= BATCH_SIZE) await commitBatch();
          continue;
        }

        const newRef = doc(db, "reports", computedKey);
        batch.set(newRef, { ...r, reportKey: computedKey });
        batch.delete(doc(db, "reports", r.id));
        created += 1;
        deleted += 1;
        idSet.add(computedKey);
        ops += 2;

        if (ops >= BATCH_SIZE) await commitBatch();
      }

      await commitBatch();

      setBackfillReportKeyMessage(
        `Migration complete. Created ${created}, updated ${updated}, ` +
          `deleted ${deleted}, duplicates skipped ${duplicates}, unchanged ${skipped}.`
      );
    } catch (e) {
      console.error("Report key migration error:", e);
      setBackfillReportKeyMessage(`Migration failed: ${e.message}`);
    } finally {
      setBackfillingReportKeys(false);
    }
  };

  const handleLoadAllReports = async () => {
    if (!userProfile?.role || userProfile.role !== "admin") return;
    setLoadingAllReports(true);
    setAllReportsError("");
    try {
      const snap = await getDocs(collection(db, "reports"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ad = parseReportDate(a.date);
        const bd = parseReportDate(b.date);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });
      setAllReports(list);
    } catch (e) {
      console.error("Load all reports error:", e);
      setAllReportsError(e.message || "Failed to load reports.");
    } finally {
      setLoadingAllReports(false);
    }
  };

  const filteredAllReports = useMemo(() => {
    if (!allReports.length) return [];
    if (!allReportsMonth || !allReportsMonth.includes("-")) return allReports;
    const [selYear, selMonth] = allReportsMonth.split("-").map((v) => Number(v));
    return allReports.filter((r) => {
      const d = parseReportDate(r.date);
      if (!d || Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === selYear && d.getMonth() === selMonth - 1;
    });
  }, [allReports, allReportsMonth]);

  const visibleAllReports = filteredAllReports.slice(0, 200);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <User className="text-blue-600" /> My Profile
      </h2>
      <Card className="p-6">
        <h3 className="font-bold border-b pb-2 mb-4">Account Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs uppercase">Name</p>
            <p className="font-semibold">{userProfile?.displayName}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase">Email</p>
            <p className="font-semibold">{userProfile?.email}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase">Branch</p>
            <p className="font-semibold">{userProfile?.branch}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase">Country</p>
            <p className="font-semibold">{userProfile?.country}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase">Role</p>
            <p className="font-semibold">{formatRoleLabel(userProfile?.role)}</p>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-bold border-b pb-2 mb-4">Update Country</h3>
        <form onSubmit={handleCountryUpdate} className="space-y-4">
          <InputGroup label="Country">
            <input
              type="text"
              className="w-full border p-2 rounded"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </InputGroup>
          <Button type="submit" disabled={savingCountry}>
            {savingCountry ? "Updating..." : "Update Country"}
          </Button>
        </form>
      </Card>
      {userProfile?.role === "admin" && (
        <Card className="p-6">
          <h3 className="font-bold border-b pb-2 mb-4">Admin Tools</h3>
          <p className="text-sm text-slate-600 mb-4">
            Backfill legacy reports that were created before country fields existed.
          </p>
          <div className="space-y-3">
            <Button variant="secondary" onClick={handleBackfillReports} disabled={backfilling}>
              {backfilling ? "Backfilling..." : "Backfill Legacy Reports"}
            </Button>
            {backfillMessage && (
              <p className="text-sm text-slate-600">{backfillMessage}</p>
            )}
          </div>
          <div className="mt-6 border-t pt-4">
            <p className="text-sm text-slate-600 mb-3">
              Migrate legacy report IDs to the new duplicate-safe format (country + date +
              location + service type).
            </p>
            <div className="space-y-3">
              <Button
                variant="secondary"
                onClick={handleBackfillReportKeys}
                disabled={backfillingReportKeys}
              >
                {backfillingReportKeys ? "Migrating..." : "Migrate Report IDs"}
              </Button>
              {backfillReportKeyMessage && (
                <p className="text-sm text-slate-600">{backfillReportKeyMessage}</p>
              )}
            </div>
          </div>
          <div className="mt-6 border-t pt-4">
            <p className="text-sm text-slate-600 mb-3">
              One-time utility: load all reports across the database to locate missing entries.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleLoadAllReports}
                disabled={loadingAllReports}
              >
                {loadingAllReports ? "Loading..." : "Show All Reports (Temp)"}
              </Button>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label>Filter Month:</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 rounded border text-slate-600 hover:bg-slate-100"
                    aria-label="Previous month"
                    onClick={() => setAllReportsMonth(shiftMonth(allReportsMonth, -1))}
                  >
                    ‹
                  </button>
                  <input
                    type="month"
                    className="border rounded px-2 py-1 text-sm"
                    value={allReportsMonth}
                    onChange={(e) => setAllReportsMonth(e.target.value)}
                  />
                  <button
                    type="button"
                    className="px-2 py-1 rounded border text-slate-600 hover:bg-slate-100"
                    aria-label="Next month"
                    onClick={() => setAllReportsMonth(shiftMonth(allReportsMonth, 1))}
                  >
                    ›
                  </button>
                </div>
              </div>
              {allReports.length > 0 && (
                <span className="text-xs text-slate-500">
                  {filteredAllReports.length} match(es) • showing {visibleAllReports.length}
                </span>
              )}
            </div>
            {allReportsError && (
              <p className="text-sm text-red-600 mt-2">{allReportsError}</p>
            )}
            {visibleAllReports.length > 0 && (
              <div className="mt-4 max-h-72 overflow-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="text-left px-2 py-1">Date</th>
                      <th className="text-left px-2 py-1">Branch</th>
                      <th className="text-left px-2 py-1">Prepared By</th>
                      <th className="text-left px-2 py-1">Country</th>
                      <th className="text-left px-2 py-1">Country Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAllReports.map((r) => {
                      const d = parseReportDate(r.date);
                      const dateLabel = d
                        ? d.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric"
                          })
                        : r.date || "-";
                      const branchLabel =
                        r.branch === "Other" && r.otherBranch ? r.otherBranch : r.branch || "-";
                      return (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="px-2 py-1 whitespace-nowrap">{dateLabel}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{branchLabel}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{r.createdBy || "-"}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{r.country || "-"}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{r.countryKey || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
      <Card className="p-6">
        <h3 className="font-bold border-b pb-2 mb-4">Change Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <InputGroup label="New Password">
            <input
              type="password"
              className="w-full border p-2 rounded"
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
            />
          </InputGroup>
          <InputGroup label="Confirm Password">
            <input
              type="password"
              className="w-full border p-2 rounded"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            />
          </InputGroup>
          <Button type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

