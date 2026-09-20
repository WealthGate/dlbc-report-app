import { subscribeToReports } from "./services/reportSubscriptions";
import PrintStyles from "./components/PrintStyles";
import React, { lazy, Suspense, useState, useEffect } from 'react';
import appPackage from '../package.json';
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
  doc,
  query,
  updateDoc,
  where,
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
  isCombinedServiceRecord,
  normalizeCountryKey
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
  const [reportsError, setReportsError] = useState("");
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsReload, setReportsReload] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  const [availableVersion, setAvailableVersion] = useState("");
  const [combinedServiceNotices, setCombinedServiceNotices] = useState([]);
  const [editingReport, setEditingReport] = useState(null);
  const [currentReport, setCurrentReport] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      try {
        const response = await fetch("/version.json", { cache: "no-store" });
        if (!response.ok) return;
        const release = await response.json();
        if (active && release.version && release.version !== appPackage.version) setAvailableVersion(release.version);
      } catch { /* Offline or older deployment: keep the current app and drafts open. */ }
    };
    check();
    const timer = window.setInterval(check, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, []);
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
    let unsubProfile = () => {};
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        unsubProfile();
        setReports([]);
        setUserProfile(null);
        setLoadingAuth(true);
        setAuthError(null);

        if (!currentUser) {
          setUser(null);
          setUserProfile(null);
          setLoadingAuth(false);
          return;
        }

        setUser(currentUser);

        unsubProfile = onSnapshot(
          doc(db, "users", currentUser.uid),
          (docSnap) => {
            if (auth.currentUser?.uid !== currentUser.uid) return;
            if (docSnap.exists()) {
              setUserProfile(docSnap.data());
            } else {
              // Administrator roles must be provisioned by a trusted administrator,
              // never recreated from a hard-coded email address in the client.
              setUserProfile(null);
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

      },
      (err) => {
        console.error(err);
        setAuthError(err.message);
        setLoadingAuth(false);
      }
    );
    return () => { unsubscribe(); unsubProfile(); };
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
    // Clear the previous subscription's data before connecting a different account/country.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReports([]);
    setReportsError("");
    setReportsLoading(true);
    if (!user || !userProfile) return undefined;
    return subscribeToReports({ db, uid: user.uid, email: user.email, countryKey,
      country: countryLabel, canReadCountry: canViewCountryData,
      onChange: ({ reports: loaded, loading, error }) => {
        setReports(loaded); setReportsLoading(loading); setReportsError(error);
      }
    });
  }, [user, userProfile, canViewCountryData, countryKey, countryLabel, reportsReload]);

  useEffect(() => {
    if (!user || !countryKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCombinedServiceNotices([]);
      return undefined;
    }
    const noticesQuery = query(
      collection(db, "combined_service_notices"),
      where("countryKey", "==", countryKey)
    );
    return onSnapshot(
      noticesQuery,
      (snapshot) => {
        setCombinedServiceNotices(
          snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }))
            .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))
        );
      },
      (error) => console.log("Combined service notices sync error:", error)
    );
  }, [user, countryKey]);

  const handleSaveReport = async (reportData) => {
    if (reportsLoading || reportsError || isOffline) {
      alert("Existing reports must finish loading before saving. Check your connection and any loading error; your form has not been cleared.");
      return;
    }
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
      const submittedBranchLabel = getBranchLabel(basePayload);
      const submittedServiceLabel = getServiceLabel(basePayload);
      const batch = writeBatch(db);

      const matchingReports = reports.filter((existingData) => {
        if (existingData.id === reportData.id) return false;
        return (
          String(existingData.date || "") === String(basePayload.date || "") &&
          getServiceLabel(existingData) === submittedServiceLabel
        );
      });
      const matchingCombinedReport = matchingReports.find(isCombinedServiceRecord);
      const matchingCombinedNotice = combinedServiceNotices.find(notice => notice.reportId !== reportData.id && notice.date === basePayload.date && notice.serviceLabel === submittedServiceLabel);
      if (!reportData.isCombinedService && (matchingCombinedReport || matchingCombinedNotice)) {
        alert(
          `A combined service has already been entered for ${submittedServiceLabel} on ${basePayload.date}. Do not add a branch report for the same service.`
        );
        return;
      }
      if (reportData.isCombinedService && matchingReports.length > 0) {
        alert(
          `Branch reports already exist for ${submittedServiceLabel} on ${basePayload.date}. Remove or change those reports before entering one combined service, so attendance is not duplicated.`
        );
        return;
      }

      let savedReportId = reportData.id || "";
      if (reportData.id) {
        const { id: _id, ...rest } = basePayload;
        batch.update(doc(db, "reports", reportData.id), {
          ...rest,
          reportKey,
          lastModifiedBy: user.email,
          lastModifiedAt: new Date().toISOString()
        });
      } else {
        const visibleDuplicate = reports.find((existingData) => {
          if (String(existingData.date || "") !== String(basePayload.date || "")) return false;
          return (
            getBranchLabel(existingData) === submittedBranchLabel &&
            getServiceLabel(existingData) === submittedServiceLabel
          );
        });

        if (visibleDuplicate) {
          const branchLabel = getBranchLabel(visibleDuplicate);
          const serviceLabel = getServiceLabel(visibleDuplicate);
          alert(
            `A report already exists for ${branchLabel} on ${visibleDuplicate.date || reportData.date} (${serviceLabel}).`
          );
          return;
        }

        const reportRef = doc(collection(db, "reports"), reportData.submissionId || crypto.randomUUID());
        batch.set(reportRef, {
          ...basePayload,
          reportKey,
          reportDocumentId: reportRef.id,
          createdAt: new Date().toISOString(),
          createdBy: user.email,
          createdByUid: user.uid,
          country: userProfile?.country || "",
          countryKey
        });
        savedReportId = reportRef.id;
      }

      const noticeRef = doc(db, "combined_service_notices", reportKey);
      const previousReport = reportData.id
        ? reports.find((entry) => entry.id === reportData.id)
        : null;
      if (reportData.isCombinedService) {
        if (
          isCombinedServiceRecord(previousReport) &&
          previousReport.reportKey &&
          previousReport.reportKey !== reportKey
        ) {
          batch.delete(doc(db, "combined_service_notices", previousReport.reportKey));
        }
        batch.set(noticeRef, {
          reportId: savedReportId,
          reportKey,
          date: basePayload.date,
          serviceLabel: submittedServiceLabel,
          country: userProfile?.country || "",
          countryKey,
          createdBy: previousReport?.createdBy || user.email,
          updatedAt: new Date().toISOString()
        });
      } else if (isCombinedServiceRecord(previousReport)) {
        batch.delete(doc(db, "combined_service_notices", previousReport.reportKey || reportKey));
      }
      await batch.commit();
      setSaveMessage(`Saved ${submittedServiceLabel} for ${basePayload.date} — ${submittedBranchLabel}.`);
      setEditingReport(null);
      setView("dashboard");
    } catch (e) {
      if (e?.code === "permission-denied") {
        alert(
          "This report could not be saved because your account is missing permission for this country or location. Please contact the administrator to confirm your user profile country and branch."
        );
        return;
      }
      alert("Error saving: " + e.message);
    }
  };

  const deleteReport = async (id) => {
    if (window.confirm("Delete this report?")) {
      try {
        const report = reports.find((entry) => entry.id === id);
        const batch = writeBatch(db);
        batch.delete(doc(db, "reports", id));
        if (isCombinedServiceRecord(report)) {
          batch.delete(doc(db, "combined_service_notices", report.reportKey));
        }
        await batch.commit();
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

  if (!userProfile) {
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
                National Reporting System - {userProfile?.country || "Country"} · v{appPackage.version}
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

      <div className="w-full max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px,minmax(0,1fr)] gap-6 overflow-x-hidden">
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
        <main className="min-w-0 max-w-full overflow-x-hidden">
          {availableVersion && <div role="status" className="no-print mb-4 rounded border border-blue-300 bg-blue-50 p-3 text-blue-900">
            Update {availableVersion} is available. Save your work first. <button className="underline font-semibold" onClick={() => { if (window.confirm("Have you saved your entries? Reload to install the app update?")) window.location.reload(); }}>Update now</button>
          </div>}
          {reportsError && <div role="alert" className="no-print mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-900">{reportsError}</div>}
          {saveMessage && <div role="status" className="no-print mb-4 rounded border border-green-300 bg-green-50 p-3 text-green-900">{saveMessage}</div>}
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
                    } catch {
                      // Ignore localStorage failures; dismissal still applies for this session.
                    }
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
              loading={reportsLoading}
              error={reportsError}
              onRetry={() => setReportsReload(value => value + 1)}
              reports={reports}
              combinedServiceNotices={combinedServiceNotices}
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
          {view === "users" && isAdmin && (
            <UserManagement userProfile={userProfile} db={db} app={app} currentUserId={user.uid} />
          )}

          {view === "profile" && (
            <UserProfile userProfile={userProfile} db={db} auth={auth} />
          )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
