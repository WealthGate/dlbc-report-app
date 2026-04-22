import React from "react";

export const EXPENSE_LOCATION_NON_BRANCH = "Not branch-specific";
export const EXPENSE_LOCATION_OTHER = "Other location";
export const EXPENSE_PURPOSE_OTHER = "Others";

export const MONTHLY_EXPENSE_PURPOSE_OPTIONS = [
  "GCK",
  "rent",
  "Radio programme",
  "Utilities",
  "Prayer Conference",
  "Retreat",
  "Transport",
  "repair",
  "Pastor's apartment",
  "Other"
];

export const normalizeCountryKey = (value = "") => value.trim().toLowerCase();

export const normalizeRole = (role = "") =>
  role.trim().toLowerCase().replace(/[\s-]+/g, "_");

export const formatRoleLabel = (role = "") =>
  normalizeRole(role)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const isVettingCommitteeChairman = (role = "") => {
  const normalized = normalizeRole(role);
  return (
    normalized === "vetting_committee_chairman" ||
    normalized === "vetting_committee_chair" ||
    normalized === "committee_chairman"
  );
};

export const isFinanceReporter = (role = "") => {
  const normalized = normalizeRole(role);
  return (
    normalized === "finance_reporter" ||
    normalized === "financial_secretary" ||
    normalized === "finance_secretary" ||
    normalized === "accountant"
  );
};

export const canReadCountryReports = (profile) =>
  profile?.role === "admin" ||
  isVettingCommitteeChairman(profile?.role || "") ||
  isFinanceReporter(profile?.role || "");

export const canEditMonthlyExpenses = (profile) =>
  profile?.role === "admin" || isVettingCommitteeChairman(profile?.role || "");

export const createMonthlyExpenseRowId = () =>
  `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const defaultMonthlyExpenseRow = (date = "", overrides = {}) => ({
  localId: overrides.localId || overrides.id || createMonthlyExpenseRowId(),
  id: overrides.id || "",
  date,
  purpose: "",
  otherDetails: "",
  amount: "",
  createdAt: overrides.createdAt || "",
  updatedAt: overrides.updatedAt || "",
  savedBy: overrides.savedBy || "",
  ...overrides
});

export const normalizeMonthlyExpenseRow = (row = {}, month = "") =>
  defaultMonthlyExpenseRow(row.date || (month ? `${month}-01` : ""), {
    ...row,
    purpose: row.purpose || "",
    otherDetails: row.otherDetails || "",
    amount: row.amount ?? "",
    localId: row.localId || row.id || createMonthlyExpenseRowId()
  });

export const isMonthlyExpenseRowMeaningful = (row = {}) =>
  Boolean(
    String(row.date || "").trim() ||
      String(row.purpose || "").trim() ||
      String(row.otherDetails || "").trim() ||
      String(row.amount || "").trim()
  );

export const getMonthlyExpensePurposeLabel = (row = {}) => {
  const purpose = String(row.purpose || "").trim();
  if (!purpose) return "General";
  if (purpose === "Other") {
    return String(row.otherDetails || "").trim() || "Other";
  }
  return purpose;
};

export const pad2 = (value) => String(value).padStart(2, "0");

export const formatLocalDateKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const formatLocalMonthKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

export const parseReportDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
      return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    }
    const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      return new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
    }
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  return null;
};

export const getServiceLabel = (report) => {
  if (!report) return "Service";
  const type = report.serviceType || "Service";
  if (type === "Other Programme") return report.otherServiceType?.trim() || "Other Programme";
  if (type === "Other") return report.otherServiceType?.trim() || "Other";
  if (type === "Special Programme") {
    return report.specialProgramme?.name?.trim() || "Special Programme";
  }
  return type;
};

export const getBranchLabel = (report = {}) => {
  if (report.branch === "Other") return report.otherBranch?.trim() || "Other";
  return report.branch || "Unknown";
};

export const normalizeKeyPart = (value = "") => {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || "unknown";
};

export const buildReportKey = ({
  countryKey,
  date,
  serviceType,
  otherServiceType,
  branch,
  otherBranch
}) => {
  const serviceLabel =
    serviceType === "Other Programme" || serviceType === "Other"
      ? otherServiceType?.trim() || serviceType || "Service"
      : serviceType || "Service";
  const branchLabel = branch === "Other" && otherBranch?.trim() ? otherBranch.trim() : branch || "Unknown";
  return [
    normalizeKeyPart(countryKey || "country"),
    normalizeKeyPart(date || "date"),
    normalizeKeyPart(branchLabel),
    normalizeKeyPart(serviceLabel)
  ].join("__");
};

export const normalizeExpenseRow = (row = {}, reportBranch = "") => {
  const location = row.location || reportBranch || "";
  const purpose = row.purpose || "";
  return {
    label: row.label || "",
    amount: row.amount ?? "",
    location,
    locationName: row.locationName || "",
    purpose,
    purposeName: row.purposeName || ""
  };
};

export const resolveExpenseLocationLabel = (row = {}, reportBranch = "") => {
  const location = String(row.location || "").trim();
  if (location === EXPENSE_LOCATION_OTHER) {
    return String(row.locationName || "").trim() || EXPENSE_LOCATION_OTHER;
  }
  if (location === EXPENSE_LOCATION_NON_BRANCH) return EXPENSE_LOCATION_NON_BRANCH;
  return location || reportBranch || "Unspecified";
};

export const resolveExpensePurposeLabel = (row = {}) => {
  const purpose = String(row.purpose || "").trim();
  if (!purpose) return "General";
  if (purpose === EXPENSE_PURPOSE_OTHER) {
    return String(row.purposeName || "").trim() || EXPENSE_PURPOSE_OTHER;
  }
  return purpose;
};

export const resolveExpenseTargetLabel = (row = {}, reportBranch = "") => {
  const locationLabel = resolveExpenseLocationLabel(row, reportBranch);
  if (locationLabel === EXPENSE_LOCATION_NON_BRANCH) {
    return `Purpose: ${resolveExpensePurposeLabel(row)}`;
  }
  return `Branch: ${locationLabel}`;
};

export const formatExpenseDisplay = (row = {}, reportBranch = "") => {
  const locationLabel = resolveExpenseLocationLabel(row, reportBranch);
  const purposeLabel = resolveExpensePurposeLabel(row);
  const detail = String(row.label || "").trim();
  const base =
    locationLabel === EXPENSE_LOCATION_NON_BRANCH
      ? `${purposeLabel}`
      : `${locationLabel} - ${purposeLabel}`;
  return detail ? `${base} (${detail})` : base;
};

export const openMailTo = (subject, body) => {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export const buildServiceReportEmailBody = (report) => {
  if (!report) return "";
  const serviceLabel = getServiceLabel(report);
  const attendance = report.attendance || {};
  const men = parseInt(attendance.men || 0, 10) || 0;
  const women = parseInt(attendance.women || 0, 10) || 0;
  const children = parseInt(attendance.children || 0, 10) || 0;
  const newVisitors = parseInt(report.newVisitors ?? attendance.newVisitors ?? 0, 10) || 0;
  const totalAttendance = men + women + children;
  const income = report.financials?.income || [];
  const expenses = report.financials?.expenses || [];
  const incomeTotal = income.reduce((s, r) => s + (parseFloat(r.amount || 0) || 0), 0);
  const expenseTotal = expenses.reduce((s, r) => s + (parseFloat(r.amount || 0) || 0), 0);
  const branchName =
    report.branch === "Other" && report.otherBranch ? report.otherBranch : report.branch || "";

  return [
    `Service Report`,
    ``,
    `Date: ${report.date || "-"}`,
    `Day: ${report.dayOfWeek || "-"}`,
    `Service: ${serviceLabel || "-"}`,
    `Branch: ${branchName || "-"}`,
    ``,
    `Attendance`,
    `Men: ${men}`,
    `Women: ${women}`,
    `Children: ${children}`,
    `New Visitors: ${newVisitors}`,
    `Total: ${totalAttendance}`,
    ``,
    `Income Details`,
    ...(income.length
      ? income.map((row) => `- ${(row.label || row.purpose || "Income").trim()}: XCD ${(parseFloat(row.amount || 0) || 0).toFixed(2)}`)
      : ["- No income lines recorded."]),
    ``,
    `Expense Details`,
    ...(expenses.length
      ? expenses.map((row) => `- ${formatExpenseDisplay(row, branchName)}: XCD ${(parseFloat(row.amount || 0) || 0).toFixed(2)}`)
      : ["- No expense lines recorded."]),
    ``,
    `Income Total (XCD): ${incomeTotal.toFixed(2)}`,
    `Expense Total (XCD): ${expenseTotal.toFixed(2)}`,
    `Net Balance (XCD): ${(incomeTotal - expenseTotal).toFixed(2)}`,
    ``,
    report.notes ? `Notes:\n${report.notes}` : ""
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildMonthlyEmailBody = (monthLabel, countryLabel, summary, customText) => {
  const totalAttendance =
    (summary?.totalMen || 0) + (summary?.totalWomen || 0) + (summary?.totalChildren || 0);
  const broughtForward = Number(summary?.balanceBroughtForward || 0);
  const netMovement = (summary?.totalIncome || 0) - (summary?.totalExpense || 0);
  return [
    `Monthly Report Letter`,
    ``,
    `Country: ${countryLabel || "-"}`,
    `Month: ${monthLabel || "-"}`,
    ``,
    `Attendance Summary`,
    `Men: ${summary?.totalMen || 0}`,
    `Women: ${summary?.totalWomen || 0}`,
    `Children: ${summary?.totalChildren || 0}`,
    `New Visitors: ${summary?.totalNewVisitors || 0}`,
    `Total: ${totalAttendance}`,
    ``,
    `Income Total (XCD): ${(summary?.totalIncome || 0).toFixed(2)}`,
    `Expense Total (XCD): ${(summary?.totalExpense || 0).toFixed(2)}`,
    `Balance Brought Forward (XCD): ${broughtForward.toFixed(2)}`,
    `Net Movement (XCD): ${netMovement.toFixed(2)}`,
    `Closing Balance (XCD): ${(broughtForward + netMovement).toFixed(2)}`,
    ``,
    `Letter Body`,
    customText || "",
    ``,
    `Attachment note: mailto links cannot attach files automatically. Use Print -> Save as PDF, then attach manually.`
  ]
    .filter(Boolean)
    .join("\n");
};

export const Card = React.forwardRef(({ children, className = "" }, ref) => (
  <div ref={ref} className={`bg-white rounded-lg shadow-sm border border-slate-200 ${className}`}>
    {children}
  </div>
));

Card.displayName = "Card";

export const Button = ({
  onClick,
  children,
  variant = "primary",
  className = "",
  type = "button",
  disabled = false
}) => {
  const variants = {
    primary: "bg-blue-900 text-white hover:bg-blue-800",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    success: "bg-green-600 text-white hover:bg-green-700"
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-transparent disabled:opacity-60 disabled:cursor-not-allowed justify-center ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const InputGroup = ({ label, children }) => (
  <div className="mb-4">
    <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
    {children}
  </div>
);
