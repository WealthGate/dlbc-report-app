import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  DollarSign,
  Home,
  MapPin,
  LogOut,
  Loader,
  WifiOff,
  BarChart2,
  ShieldCheck,
  UserPlus,
  User,
  FilePlus,
  AlertTriangle
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  updateDoc,
  where,
  getDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import {
  getAuth,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  buildReportKey,
  canEditMonthlyExpenses,
  canReadCountryReports,
  Card,
  formatRoleLabel,
  getBranchLabel,
  getServiceLabel,
  normalizeCountryKey,
  parseReportDate
} from './views/viewShared';

const Dashboard = lazy(() => import("./views/Dashboard"));
const LoginScreen = lazy(() => import("./views/LoginScreen"));
const MonthlyAnalytics = lazy(() => import("./views/MonthlyAnalytics"));
const ReportForm = lazy(() => import("./views/ReportForm"));
const ReportPreview = lazy(() => import("./views/ReportPreview"));
const UserManagement = lazy(() => import("./views/UserManagement"));
const UserProfile = lazy(() => import("./views/UserProfile"));

// --- FIREBASE CONFIGURATION ---
// (These are the same values already in your project)
const firebaseConfig = {
  apiKey: "AIzaSyDhSOQFjNb6ZBChGPWOxqCTp5PQLEIYyes",
  authDomain: "dlbcdom.firebaseapp.com",
  projectId: "dlbcdom",
  storageBucket: "dlbcdom.firebasestorage.app",
  messagingSenderId: "406500456836",
  appId: "1:406500456836:web:e717c495ca992a1a2e3794"
};

const SUPER_ADMIN_EMAIL = "deeperlifedom@gmail.com";
const APRIL_HEADQUARTERS_MIGRATION_MONTH = "2026-04";

// --- INITIALIZE FIREBASE ---
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);


const APP_ANNOUNCEMENT = {
  id: "2026-01-30-service-date-fix",
  title: "System update",
  message:
    "Dates now display exactly as entered. If you choose Other Programme, please enter the service name so it appears in reports."
};

const getMissingCountryKeyUpdate = (profile) => {
  if (!profile || String(profile.countryKey || "").trim()) return null;
  const countryKey = normalizeCountryKey(profile.country || "");
  return countryKey ? { countryKey } : null;
};

// const PrintStyles = () => (
//   <style>{`
//     @page { size: A4; margin: 15mm; }

//     /* On-screen: keep current look */
//     #printable-letter .letter-head-title {
//       color: #0b3b66;
//     }

//     /* Print rules: hide everything except printable letter */
//     @media print {
//   body * {
//     visibility: hidden !important;
//   }

//   #printable-letter,
//   #printable-letter * {
//     visibility: visible !important;
//   }

//   #printable-letter {
//     position: absolute !important;
//     left: 0;
//     top: 0;
//     width: 100%;
//     padding: 0 !important;
//     margin: 0 !important;
//     background: white !important;
//   }

//   .no-print,
//   button,
//   textarea:not(.letter-body),
//   nav,
//   aside {
//     display: none !important;
//   }

//   html, body {
//     background: white !important;
//     -webkit-print-color-adjust: exact !important;
//     print-color-adjust: exact !important;
//   }
// }

//   `}</style>
// );


function PrintStyles() {
  return (
    <style>
      {`
        @page {
          margin: 12mm;
        }

        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body * {
            visibility: hidden !important;
          }

          .printable-area {
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            max-height: none !important;
            visibility: visible !important;
          }

          .printable-area * {
            visibility: visible !important;
          }

          .monthly-letter-card {
            padding: 10mm !important;
          }

          .monthly-table-card {
            padding: 6mm !important;
          }

          .no-print,
          button,
          textarea,
          nav,
          aside {
            display: none !important;
          }

          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
        }
      `}
    </style>
  );
}
// --- MAIN APP COMPONENT ---

export default function ChurchReportApp() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [view, setView] = useState("dashboard");
  const [analyticsSection, setAnalyticsSection] = useState("report");
  const [analyticsJumpToken, setAnalyticsJumpToken] = useState(0);
  const [reports, setReports] = useState([]);
  const [migratedAprilHeadquartersReports, setMigratedAprilHeadquartersReports] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [currentReport, setCurrentReport] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [announcementDismissed, setAnnouncementDismissed] = useState(() => {
    try {
      return localStorage.getItem("app_announcement_dismissed") === APP_ANNOUNCEMENT.id;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onStatusChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener("online", onStatusChange);
    window.addEventListener("offline", onStatusChange);
    return () => {
      window.removeEventListener("online", onStatusChange);
      window.removeEventListener("offline", onStatusChange);
    };
  }, []);

  useEffect(() => {
    document.title = "DLBC Reporting System";
    const link =
      document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon";
    link.href = "./logo.png";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setLoadingAuth(true);
        setAuthError(null);

        if (!currentUser) {
          setUser(null);
          setUserProfile(null);
          setLoadingAuth(false);
          return;
        }

        setUser(currentUser);

        const unsubProfile = onSnapshot(
          doc(db, "users", currentUser.uid),
          async (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data());
            } else {
              if (currentUser.email === SUPER_ADMIN_EMAIL) {
                const adminProfile = {
                  displayName: "Super Admin",
                  branch: "Goodwill",
                  country: "Global",
                  countryKey: "global",
                  email: currentUser.email,
                  role: "admin",
                  createdAt: new Date().toISOString()
                };
                await setDoc(doc(db, "users", currentUser.uid), adminProfile);
                setUserProfile(adminProfile);
              } else {
                setUserProfile(null);
              }
            }
            setLoadingAuth(false);
          },
          (err) => {
            console.error("Profile sync error:", err);
            if (err.code === "permission-denied") {
              setAuthError("Database Access Denied: Please update Firebase Rules.");
            } else {
              setAuthError("Connection Error: " + err.message);
            }
            setLoadingAuth(false);
          }
        );

        return () => unsubProfile();
      },
      (err) => {
        console.error(err);
        setAuthError(err.message);
        setLoadingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const isAdmin = userProfile?.role === "admin";
  const canManageExpenses = canEditMonthlyExpenses(userProfile);
  const canViewCountryData = canReadCountryReports(userProfile);
  const countryLabel = userProfile?.country || "";
  const countryKey = userProfile?.countryKey || normalizeCountryKey(countryLabel);

  useEffect(() => {
    if (!user || !userProfile) return;
    const update = getMissingCountryKeyUpdate(userProfile);
    const branchUpdate = userProfile.branch === "Headquarters" ? { branch: "Goodwill" } : null;
    const profileUpdate = { ...(update || {}), ...(branchUpdate || {}) };
    if (!Object.keys(profileUpdate).length) return;

    updateDoc(doc(db, "users", user.uid), profileUpdate).catch((err) => {
      console.error("Unable to update missing profile country key:", err);
    });
  }, [user, userProfile]);

  useEffect(() => {
    if (!user || migratedAprilHeadquartersReports) return;
    if (!reports.length) return;
    const targets = (reports || []).filter(
      (report) =>
        report?.id &&
        report.branch === "Headquarters" &&
        String(report.date || "").startsWith(`${APRIL_HEADQUARTERS_MIGRATION_MONTH}-`)
    );
    if (!targets.length) {
      setMigratedAprilHeadquartersReports(true);
      return;
    }

    const migrateReports = async () => {
      try {
        const batch = writeBatch(db);
        for (const report of targets) {
          const migratedReport = {
            ...report,
            branch: "Goodwill",
            otherBranch: "",
            lastModifiedBy: user.email,
            lastModifiedAt: new Date().toISOString()
          };
          const reportKey = buildReportKey({
            countryKey: report.countryKey || countryKey,
            date: migratedReport.date,
            serviceType: migratedReport.serviceType,
            otherServiceType: migratedReport.otherServiceType,
            branch: migratedReport.branch,
            otherBranch: migratedReport.otherBranch
          });
          const { id, ...payload } = migratedReport;
          const nextPayload = { ...payload, reportKey };

          if (report.id === reportKey) {
            batch.update(doc(db, "reports", report.id), nextPayload);
          } else {
            batch.set(doc(db, "reports", reportKey), nextPayload, { merge: true });
            batch.delete(doc(db, "reports", report.id));
          }
        }
        await batch.commit();
      } catch (err) {
        console.error("Unable to migrate April Headquarters reports to Goodwill:", err);
      } finally {
        setMigratedAprilHeadquartersReports(true);
      }
    };

    migrateReports();
  }, [user, reports, countryKey, migratedAprilHeadquartersReports]);

  useEffect(() => {
    if (!user) return;

    const sortReports = (list) =>
      list.sort((a, b) => {
        const ad = parseReportDate(a.date);
        const bd = parseReportDate(b.date);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });

    if (canViewCountryData) {
      if (!countryKey) return;
      const qPrimary = query(
        collection(db, "reports"),
        where("countryKey", "==", countryKey)
      );
      const qLegacy = countryLabel
        ? query(collection(db, "reports"), where("country", "==", countryLabel))
        : null;
      const qMissingCountryKey = query(
        collection(db, "reports"),
        where("countryKey", "==", null)
      );

      let primaryReports = [];
      let legacyReports = [];
      let missingKeyReports = [];
      const applyMerged = () => {
        const map = new Map();
        primaryReports.forEach((r) => map.set(r.id, r));
        legacyReports.forEach((r) => {
          if (!map.has(r.id)) map.set(r.id, r);
        });
        missingKeyReports.forEach((r) => {
          if (!map.has(r.id)) map.set(r.id, r);
        });
        const merged = sortReports(Array.from(map.values()));
        setReports(merged);
      };

      const unsubPrimary = onSnapshot(
        qPrimary,
        (snapshot) => {
          primaryReports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          applyMerged();
        },
        (err) => {
          console.log("Reports sync error:", err);
        }
      );

      let unsubLegacy = () => {};
      if (qLegacy) {
        unsubLegacy = onSnapshot(
          qLegacy,
          (snapshot) => {
            legacyReports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            applyMerged();
          },
          (err) => {
            console.log("Reports sync error (legacy):", err);
          }
        );
      }

      const unsubMissingKey = onSnapshot(
        qMissingCountryKey,
        (snapshot) => {
          missingKeyReports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          applyMerged();
        },
        (err) => {
          console.log("Reports sync error (missing countryKey):", err);
        }
      );

      return () => {
        unsubPrimary();
        unsubLegacy();
        unsubMissingKey();
      };
    }

    const q = query(
      collection(db, "reports"),
      where("createdBy", "==", user.email)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const reportsData = sortReports(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        );
        setReports(reportsData);
      },
      (err) => {
        console.log("Reports sync error:", err);
      }
    );
    return () => unsubscribe();
  }, [user, canViewCountryData, countryKey, countryLabel]);

  const handleSaveReport = async (reportData) => {
    try {
      const submittedBranch = String(reportData.branch || "").trim();
      const profileBranch =
        userProfile?.branch === "Headquarters" ? "" : String(userProfile?.branch || "").trim();
      if (!reportData.id && canViewCountryData && !submittedBranch) {
        alert("Please select the report location before saving.");
        return;
      }
      const effectiveBranch = reportData.id
        ? submittedBranch
        : submittedBranch || profileBranch;
      if (!effectiveBranch || effectiveBranch === "Headquarters") {
        alert("Please select a valid report location before saving.");
        return;
      }
      const normalizedEffectiveBranch = effectiveBranch;
      const effectiveOtherBranch =
        normalizedEffectiveBranch === "Other" ? reportData.otherBranch : "";
      const basePayload = reportData.id
        ? {
            ...reportData,
            branch: normalizedEffectiveBranch,
            otherBranch: effectiveOtherBranch
          }
        : { ...reportData, branch: normalizedEffectiveBranch, otherBranch: effectiveOtherBranch };

      const reportKey = buildReportKey({
        countryKey,
        date: basePayload.date,
        serviceType: basePayload.serviceType,
        otherServiceType: basePayload.otherServiceType,
        branch: basePayload.branch,
        otherBranch: basePayload.otherBranch
      });

      if (reportData.id) {
        const { id, ...rest } = basePayload;
        await updateDoc(doc(db, "reports", reportData.id), {
          ...rest,
          reportKey,
          lastModifiedBy: user.email,
          lastModifiedAt: new Date().toISOString()
        });
      } else {
        const reportRef = doc(db, "reports", reportKey);
        let existing = null;
        try {
          existing = await getDoc(reportRef);
        } catch (e) {
          existing = null;
        }
        if (existing?.exists()) {
          const existingData = existing.data() || {};
          const existingBranchLabel = getBranchLabel(existingData);
          const submittedBranchLabel = getBranchLabel(basePayload);
          const existingServiceLabel = getServiceLabel(existingData);
          const submittedServiceLabel = getServiceLabel(basePayload);
          const sameSubmittedReport =
            String(existingData.date || "") === String(basePayload.date || "") &&
            existingBranchLabel === submittedBranchLabel &&
            existingServiceLabel === submittedServiceLabel;

          if (!sameSubmittedReport) {
            const safeReportRef = doc(
              collection(db, "reports")
            );
            await setDoc(safeReportRef, {
              ...basePayload,
              reportKey: safeReportRef.id,
              legacyCollisionKey: reportKey,
              createdAt: new Date().toISOString(),
              createdBy: user.email,
              country: userProfile?.country || "",
              countryKey
            });
            setEditingReport(null);
            setView("dashboard");
            return;
          }

          const branchLabel = getBranchLabel(existingData);
          const serviceLabel = getServiceLabel(existingData);
          alert(
            `A report already exists for ${branchLabel} on ${existingData.date || reportData.date} (${serviceLabel}).`
          );
          return;
        }

        await setDoc(reportRef, {
          ...basePayload,
          reportKey,
          createdAt: new Date().toISOString(),
          createdBy: user.email,
          country: userProfile?.country || "",
          countryKey
        });
      }
      setEditingReport(null);
      setView("dashboard");
    } catch (e) {
      if (e?.code === "permission-denied") {
        alert(
          "This report could not be saved. Please confirm your profile country is set, then check whether a report with the same date, service type, and location already exists."
        );
        return;
      }
      alert("Error saving: " + e.message);
    }
  };

  const deleteReport = async (id) => {
    if (window.confirm("Delete this report?")) {
      try {
        await deleteDoc(doc(db, "reports", id));
        setView("dashboard");
      } catch (e) {
        alert("Error: " + e.message);
      }
    }
  };

  // --- RENDER STATES ---

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <PrintStyles />
        <nav className="bg-blue-900 text-white shadow-lg print:hidden"></nav>
        <div className="text-center">
          <Loader className="text-blue-700 h-10 w-10 mx-auto mb-2 animate-spin" />
          <p className="text-slate-600">Verifying Account...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Loader className="text-blue-700 h-8 w-8 animate-spin" />
          </div>
        }
      >
        <LoginScreen auth={auth} db={db} />
      </Suspense>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <Card className="w-full max-w-md p-8 text-center border-red-200">
          <AlertTriangle size={48} className="mx-auto text-red-600 mb-4" />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Error</h2>
          <p className="text-slate-700 mb-6">{authError}</p>
          <button
            onClick={() => signOut(auth)}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Sign Out
          </button>
        </Card>
      </div>
    );
  }

  if (!userProfile && user.email !== SUPER_ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-6 bg-white rounded shadow">
          <Loader className="animate-spin text-blue-700 h-8 w-8 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">
            Setting up your profile...
          </h2>
          <p className="text-slate-500 mt-2">
            Please wait while we finalize your account registration.
          </p>
          <button
            onClick={() => signOut(auth)}
            className="mt-6 text-red-500 hover:underline text-sm"
          >
            Cancel &amp; Sign Out
          </button>
        </div>
      </div>
    );
  }

  // --- MAIN LAYOUT ---

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white">
      <PrintStyles />
      <nav className="bg-blue-900 text-white shadow-lg print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src="./logo.png"
              alt="Logo"
              className="h-10 w-10 rounded-full p-0.5 bg-white/90"
              onError={(e) => (e.target.style.display = "none")}
            />
            <div>
              <h1 className="text-xl font-bold leading-tight">
                Deeper Life Bible Church
              </h1>
              <p className="text-xs text-blue-100">
                National Reporting System - {userProfile?.country || "Country"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isOffline && (
              <span className="inline-flex items-center gap-1 text-xs bg-red-600/20 px-2 py-1 rounded-full">
                <WifiOff size={14} />
                Offline Mode
              </span>
            )}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-semibold">
                {userProfile?.displayName || "User"}
              </span>
              <span className="text-xs text-blue-100 flex items-center justify-end gap-1">
                <MapPin size={12} />
                {userProfile?.branch || "Branch"}
                <span className="mx-1 text-blue-200/70">|</span>
                <ShieldCheck size={12} />
                <span>{formatRoleLabel(userProfile?.role)}</span>
              </span>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="inline-flex items-center gap-1 text-xs border border-blue-300/60 rounded-full px-3 py-1 hover:bg-blue-800/70"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-6">
        {/* Sidebar */}
        <aside className="print:hidden">
          <Card className="p-3 mb-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">
              Navigation
            </p>
            <div className="space-y-1">
              <button
                onClick={() => setView("dashboard")}
                className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md ${
                  view === "dashboard"
                    ? "bg-blue-900 text-white"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Home size={16} />
                  Dashboard
                </span>
              </button>
              <button
                onClick={() => {
                  setEditingReport(null);
                  setView("new-report");
                }}
                className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md ${
                  view === "new-report"
                    ? "bg-blue-900 text-white"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <FilePlus size={16} />
                  New Report
                </span>
              </button>
              <button
                onClick={() => {
                  setAnalyticsSection("report");
                  setView("analytics");
                }}
                className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md ${
                  view === "analytics"
                    ? "bg-blue-900 text-white"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <BarChart2 size={16} />
                  Analytics
                </span>
              </button>
              {canManageExpenses && (
                <button
                  onClick={() => {
                    setAnalyticsSection("financial-entry");
                    setAnalyticsJumpToken((prev) => prev + 1);
                    setView("analytics");
                  }}
                  className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md ${
                    view === "analytics" && analyticsSection === "financial-entry"
                      ? "bg-blue-900 text-white"
                      : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DollarSign size={16} />
                    Monthly Financial Entry
                  </span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setView("users")}
                  className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md ${
                    view === "users"
                      ? "bg-blue-900 text-white"
                      : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <UserPlus size={16} />
                    Users
                  </span>
                </button>
              )}
              <button
                onClick={() => setView("profile")}
                className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md ${
                  view === "profile"
                    ? "bg-blue-900 text-white"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <User size={16} />
                  My Profile
                </span>
              </button>
            </div>
          </Card>
        </aside>

        {/* Main content */}
        <main className="max-w-full">
          {!announcementDismissed && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-red-900">{APP_ANNOUNCEMENT.title}</p>
                  <p className="text-slate-700">{APP_ANNOUNCEMENT.message}</p>
                </div>
                <button
                  type="button"
                  className="text-red-700 hover:underline"
                  onClick={() => {
                    try {
                      localStorage.setItem(
                        "app_announcement_dismissed",
                        APP_ANNOUNCEMENT.id
                      );
                    } catch {}
                    setAnnouncementDismissed(true);
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <Suspense
            fallback={
              <Card className="p-8 text-center">
                <Loader className="text-blue-700 h-8 w-8 mx-auto mb-3 animate-spin" />
                <p className="text-sm text-slate-500">Loading view...</p>
              </Card>
            }
          >
          {view === "dashboard" && (
            <Dashboard
              reports={reports}
              isAdmin={canViewCountryData}
              canAccessMonthlyFinancialEntry={canManageExpenses}
              onOpenMonthlyFinancialEntry={() => {
                setAnalyticsSection("financial-entry");
                setAnalyticsJumpToken((prev) => prev + 1);
                setView("analytics");
              }}
              onView={(r) => {
                setCurrentReport(r);
                setView("view-report");
              }}
              onEdit={(r) => {
                setEditingReport(r);
                setView("new-report");
              }}
              onCreate={() => {
                setEditingReport(null);
                setView("new-report");
              }}
              onDelete={deleteReport}
            />
          )}

          {view === "new-report" && (
            <ReportForm
              key={editingReport?.id || `new-${userProfile?.branch || "branch"}`}
              initialData={editingReport}
              userBranch={userProfile?.branch}
              onSave={handleSaveReport}
              onCancel={() => setView("dashboard")}
            />
          )}

          {view === "view-report" && currentReport && (
            <ReportPreview
              report={currentReport}
              onBack={() => setView("dashboard")}
              onEdit={(r) => {
                setEditingReport(r);
                setView("new-report");
              }}
            />
          )}

          {view === "analytics" && (
            <MonthlyAnalytics
              reports={reports}
              userProfile={userProfile}
              initialSection={analyticsSection}
              jumpToken={analyticsJumpToken}
              app={app}
              db={db}
              auth={auth}
            />
          )}
          </Suspense>

          {view === "users" && isAdmin && (
            <UserManagement userProfile={userProfile} db={db} />
          )}

          {view === "profile" && (
            <UserProfile userProfile={userProfile} db={db} auth={auth} />
          )}
        </main>
      </div>
    </div>
  );
}
