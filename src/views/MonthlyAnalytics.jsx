import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart2, DollarSign, Download, FileText, Loader, MapPin, Printer } from "lucide-react";
import {
  buildMonthlyAiFilename,
  copyTextToClipboard,
  downloadTextFile,
  formatMonthlyAiError,
  normalizeMonthlyAiReport,
  requestMonthlyAiReportGeneration
} from "../services/monthlyAiReportClient";
import { buildMonthlyServiceSummary, buildServiceRecordsCsv, downloadCsv, getDayOfWeek, getIncomePurpose, getIncomeRowAmountXcd } from "../reporting/serviceRecords";
import {
  buildMonthlyEmailBody,
  Button,
  canEditMonthlyExpenses,
  canReadCountryReports,
  Card,
  createMonthlyExpenseRowId,
  defaultMonthlyExpenseRow,
  formatExpenseDisplay,
  formatLocalDateKey,
  formatLocalMonthKey,
  getMonthlyExpensePurposeLabel,
  getServiceLabel,
  InputGroup,
  isMonthlyExpenseRowMeaningful,
  MONTHLY_EXPENSE_PURPOSE_OPTIONS,
  normalizeCountryKey,
  normalizeExpenseRow,
  normalizeMonthlyExpenseRow,
  openMailTo,
  parseReportDate,
  resolveExpenseTargetLabel
} from "./viewShared";

function buildMonthlyLetter(monthLabel, summary, countryLabel) {
  const {
    branchSummaries,
    incomeByBranch,
    expenseByTarget,
    totalMen,
    totalWomen,
    totalChildren,
    totalYouth,
    totalNewVisitors,
    totalIncome,
    totalExpense,
    balanceBroughtForward,
    closingBalance,
    serviceCount,
    monthReports,
    notesForMonth,
    serviceRecordSummary,
    monthlyReportOverview
  } = summary;

  const grandTotal = totalMen + totalWomen + totalChildren + (totalYouth || 0);
  const branchCount = branchSummaries.length;
  const countryName = countryLabel || "your country";

  let body = "";

  body += `The following report summarizes the activities of Deeper Life Bible Church, ${countryName}, during ${monthLabel}, highlighting our programmes, attendance and financial summary.\n\n`;

  body += `OVERVIEW\n`;
  body += `During the month, a total of ${serviceCount} services and meetings were held across ${branchCount} branch location(s).\n`;
  body += `The total cumulative attendance was ${grandTotal} people: Men – ${totalMen}, Women – ${totalWomen}, Children – ${totalChildren}, Youth – ${totalYouth || 0}.\n`;
  body += `Overall average attendance: ${(monthlyReportOverview?.overall?.averageAttendance || 0).toFixed(1)} (${monthlyReportOverview?.overall?.calculation || `${grandTotal} / ${serviceCount} = ${(serviceCount ? grandTotal / serviceCount : 0).toFixed(1)}`}).\n\n`;

  if ((monthlyReportOverview?.serviceTypes || []).length > 0) {
    body += `SERVICE TYPE OVERVIEW\n`;
    body += `Service Type | Held | Cumulative | Average Calculation | Average | Minimum | Maximum\n`;
    monthlyReportOverview.serviceTypes.forEach((row) => {
      body += `${row.serviceType} | ${row.serviceCount} | ${row.attendance.total} | ${row.calculation} | ${row.averageAttendance.toFixed(1)} | ${row.minAttendance} | ${row.maxAttendance}\n`;
    });
    body += `\n`;
  }

  body += `New visitors recorded: ${totalNewVisitors || 0}.\n\n`;

  body += `ATTENDANCE AND PROGRAMMES BY BRANCH\n`;
  branchSummaries.forEach((b) => {
    body += `PROGRAMMES IN ${b.name.toUpperCase()} CHURCH\n`;
    body += `The programmes for the month included:\n`;
    b.serviceTypes.forEach((s) => {
      body += `• ${s.type}: held ${s.count} time(s), average attendance ${s.avgAttendance.toFixed(
        1
      )} (Min: ${s.minAttendance}, Max: ${s.maxAttendance}).\n`;
    });
    body += `\n`;
  });

  if ((serviceRecordSummary?.specialProgrammes || []).length > 0) {
    body += `SPECIAL PROGRAMMES / OUTREACH\n`;
    serviceRecordSummary.specialProgrammes.forEach((programme) => {
      body += `- ${programme.date || "-"} | ${programme.location || "-"} | ${programme.title || programme.type}: attendance ${programme.attendance?.total || 0}, new visitors ${programme.newVisitors || 0}`;
      if (programme.remarks) body += `; ${programme.remarks}`;
      body += `\n`;
    });
    body += `\n`;
  }

  body += `FINANCES\n`;
  body += `In the month of ${monthLabel}, the total recorded income from tithes, offerings and other sources amounted to XCD ${totalIncome.toFixed(
    2
  )}.\n`;
  const branchIncomeEntries = Object.entries(incomeByBranch || {}).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  if (branchIncomeEntries.length > 0) {
    body += `Income by branch location:\n`;
    branchIncomeEntries.forEach(([name, total]) => {
      body += `- ${name}: XCD ${Number(total || 0).toFixed(2)}\n`;
    });
  }
  const expenseTargetEntries = Object.entries(expenseByTarget || {}).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  if (expenseTargetEntries.length > 0) {
    body += `Expense by branch/purpose:\n`;
    expenseTargetEntries.forEach(([target, total]) => {
      body += `- ${target}: XCD ${Number(total || 0).toFixed(2)}\n`;
    });
  }
  body += `Total expenses recorded for the month were XCD ${totalExpense.toFixed(
    2
  )}.\n`;
  body += `Balance brought forward is XCD ${Number(balanceBroughtForward || 0).toFixed(2)}.\n`;
  body += `The net movement for the month is XCD ${(totalIncome - totalExpense).toFixed(2)}.\n`;
  body += `Closing balance is XCD ${Number(closingBalance || 0).toFixed(2)}.\n\n`;

  if (notesForMonth.length > 0) {
    body += `OTHER HIGHLIGHTS / NOTES\n`;
    notesForMonth.forEach((n) => {
      body += `• ${n.date} – ${n.branch}: ${n.note}\n`;
    });
    body += `\n`;
  }

  body += `CONCLUSION\n`;
  body += `We give God the glory for His help throughout ${monthLabel}. We remain committed to using every programme and resource for the advancement of His kingdom in ${countryName}.\n`;

  body += `We covet your prayers.\n\n`;
  body += `In His service,\n\n`;
  body += `Pastor Joshua Oluremi Alabi\n`;
  body += `National Overseer,\n`;
  body += `Deeper Life Bible Church, Dominica\n`;

  return body;
}

const sanitizeMonthlyExpenseRows = (rows = [], month = "") =>
  (rows || [])
    .map((row) => normalizeMonthlyExpenseRow(row, month))
    .filter((row) => isMonthlyExpenseRowMeaningful(row))
    .map((row) => ({
      id: row.id || "",
      localId: row.localId || row.id || createMonthlyExpenseRowId(),
      date: row.date,
      purpose: row.purpose,
      otherDetails: row.otherDetails?.trim() || "",
      amount: parseFloat(row.amount || 0) || 0,
      createdAt: row.createdAt || "",
      updatedAt: row.updatedAt || "",
      savedBy: row.savedBy || ""
    }))
    .filter((row) => row.amount || row.purpose || row.otherDetails);

const validateMonthlyExpenseRow = (row) => {
  const normalized = normalizeMonthlyExpenseRow(row);
  if (!isMonthlyExpenseRowMeaningful(normalized)) {
    return "Enter at least one expense value before saving.";
  }
  if (!normalized.date) {
    return "Please select a date for each expense row.";
  }
  if (!normalized.purpose) {
    return "Please choose a purpose for each expense row.";
  }
  if (normalized.purpose === "Other" && !String(normalized.otherDetails || "").trim()) {
    return "Please enter more details for rows with purpose 'Other'.";
  }
  if (!(parseFloat(normalized.amount || 0) > 0)) {
    return "Please enter an amount greater than zero.";
  }
  return "";
};

const getReportBranchName = (report = {}) => {
  if (report.branch === "Other" && report.otherBranch) return report.otherBranch;
  if (report.branch === "Headquarters") return "Goodwill";
  return report.branch || "Unknown";
};

const buildFinancialLedgerEntries = (summary) => {
  const incomeEntries = (summary?.incomeRegisterEntries || []).map((row) => ({
    date: row.date || "",
    details: `${row.branch || "-"} | ${row.service || "-"} | ${row.source || "Income"}`,
    income: parseFloat(row.amount || 0) || 0,
    expenditure: 0
  }));
  const expenseEntries = (summary?.monthlyExpenseEntries || []).map((row) => ({
    date: row.date || "",
    details: `${getMonthlyExpensePurposeLabel(row)}${
      row.otherDetails && row.purpose !== "Other" ? ` | ${row.otherDetails}` : ""
    }`,
    income: 0,
    expenditure: parseFloat(row.amount || 0) || 0
  }));

  const combined = [...incomeEntries, ...expenseEntries].sort((a, b) => {
    const ad = parseReportDate(a.date);
    const bd = parseReportDate(b.date);
    const at = ad?.getTime() || 0;
    const bt = bd?.getTime() || 0;
    if (at !== bt) return at - bt;
    return a.details.localeCompare(b.details);
  });

  let runningBalance = Number(summary?.balanceBroughtForward || 0);
  return combined.map((entry) => {
    runningBalance += entry.income - entry.expenditure;
    return {
      ...entry,
      runningBalance
    };
  });
};

const toWholeNumber = (value) => {
  const parsed = parseInt(value || 0, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAttendanceBreakdown = (report = {}) => {
  const attendance = report.attendance || {};
  const men = toWholeNumber(attendance.men);
  const women = toWholeNumber(attendance.women);
  const children = toWholeNumber(attendance.children);
  const youth = toWholeNumber(attendance.youth);
  const newVisitors = toWholeNumber(report.newVisitors ?? attendance.newVisitors);
  return {
    men,
    women,
    children,
    youth,
    newVisitors,
    total: men + women + children + youth
  };
};

const createOverviewBucket = ({ branch = "", serviceType = "" } = {}) => ({
  branch,
  serviceType,
  serviceCount: 0,
  attendance: { men: 0, women: 0, children: 0, youth: 0, newVisitors: 0, total: 0 },
  averageAttendance: 0,
  minAttendance: 0,
  maxAttendance: 0,
  calculation: "0 / 0 = 0.0"
});

const addReportToOverviewBucket = (bucket, report) => {
  const attendance = getAttendanceBreakdown(report);
  bucket.serviceCount += 1;
  bucket.attendance.men += attendance.men;
  bucket.attendance.women += attendance.women;
  bucket.attendance.children += attendance.children;
  bucket.attendance.youth += attendance.youth;
  bucket.attendance.newVisitors += attendance.newVisitors;
  bucket.attendance.total += attendance.total;
  bucket.minAttendance =
    bucket.serviceCount === 1
      ? attendance.total
      : Math.min(bucket.minAttendance, attendance.total);
  bucket.maxAttendance = Math.max(bucket.maxAttendance, attendance.total);
  bucket.averageAttendance = bucket.serviceCount
    ? bucket.attendance.total / bucket.serviceCount
    : 0;
  bucket.calculation = `${bucket.attendance.total} / ${bucket.serviceCount} = ${bucket.averageAttendance.toFixed(1)}`;
};

const buildMonthlyReportOverview = (monthReports = []) => {
  const overall = createOverviewBucket({ serviceType: "All services" });
  const countryServiceMap = new Map();
  const branchServiceMap = new Map();

  monthReports.forEach((report) => {
    const branch = getReportBranchName(report);
    const serviceType = getServiceLabel(report);
    addReportToOverviewBucket(overall, report);

    if (!countryServiceMap.has(serviceType)) {
      countryServiceMap.set(serviceType, createOverviewBucket({ serviceType }));
    }
    addReportToOverviewBucket(countryServiceMap.get(serviceType), report);

    const branchServiceKey = `${branch}__${serviceType}`;
    if (!branchServiceMap.has(branchServiceKey)) {
      branchServiceMap.set(
        branchServiceKey,
        createOverviewBucket({ branch, serviceType })
      );
    }
    addReportToOverviewBucket(branchServiceMap.get(branchServiceKey), report);
  });

  return {
    overall,
    serviceTypes: Array.from(countryServiceMap.values()).sort((a, b) =>
      a.serviceType.localeCompare(b.serviceType)
    ),
    branchServiceTypes: Array.from(branchServiceMap.values()).sort((a, b) => {
      const branchCompare = a.branch.localeCompare(b.branch);
      return branchCompare || a.serviceType.localeCompare(b.serviceType);
    })
  };
};

export default function MonthlyAnalytics({
  reports,
  userProfile,
  initialSection = "report",
  jumpToken = 0,
  app,
  db,
  auth
}) {
  const [selectedMonth, setSelectedMonth] = useState(
    formatLocalMonthKey(new Date()) // YYYY-MM (local)
  );
  const [customText, setCustomText] = useState("");
  const [aiReportRecord, setAiReportRecord] = useState(null);
  const [loadingAiReport, setLoadingAiReport] = useState(false);
  const [generatingAiReport, setGeneratingAiReport] = useState(false);
  const [aiReportError, setAiReportError] = useState("");
  const [aiActionMessage, setAiActionMessage] = useState("");
  const [aiActiveTab, setAiActiveTab] = useState("enriched");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [printChartMode, setPrintChartMode] = useState("none");
  const [balanceBroughtForward, setBalanceBroughtForward] = useState("");
  const [savingFinancialEntry, setSavingFinancialEntry] = useState(false);
  const [loadingMonthlyExpenseRows, setLoadingMonthlyExpenseRows] = useState(false);
  const [savingExpenseRowId, setSavingExpenseRowId] = useState("");
  const [monthlyExpenseRows, setMonthlyExpenseRows] = useState([
    defaultMonthlyExpenseRow(formatLocalDateKey(new Date()))
  ]);
  const financialEntryRef = useRef(null);
  const countryLabel = userProfile?.country || "Country";
  const countryKey = userProfile?.countryKey || normalizeCountryKey(countryLabel);
  const canManageMonthlyExpenses = canEditMonthlyExpenses(userProfile);
  const canGenerateOfficialMonthlyReport = canReadCountryReports(userProfile);
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

  const handleMonthlyExpenseChange = (index, field, value) => {
    setMonthlyExpenseRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addMonthlyExpenseRow = () => {
    setMonthlyExpenseRows((prev) => [
      ...prev,
      defaultMonthlyExpenseRow(`${selectedMonth}-01`)
    ]);
  };

  const removeMonthlyExpenseRow = (index) => {
    setMonthlyExpenseRows((prev) => {
      const copy = [...prev];
      copy.splice(index, 1);
      return copy.length ? copy : [defaultMonthlyExpenseRow(`${selectedMonth}-01`)];
    });
  };

  const summary = useMemo(() => {
    // Filter reports for selected month with resilient date parsing
    const [selYear, selMonth] = selectedMonth.split("-").map((v) => Number(v));
    const monthReports = (reports || []).filter((r) => {
      const d = parseReportDate(r.date);
      if (!d || Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === selYear && d.getMonth() === selMonth - 1;
    });
    const normalizedMonthlyExpenses = sanitizeMonthlyExpenseRows(
      monthlyExpenseRows,
      selectedMonth
    );
    const broughtForward = parseFloat(balanceBroughtForward || 0) || 0;
    const branchesMap = {};
    let totalMen = 0;
    let totalWomen = 0;
    let totalChildren = 0;
    let totalYouth = 0;
    let totalNewVisitors = 0;
    let totalIncome = 0;
    let totalExpenseFromReports = 0;
    const incomeByBranch = {};
    const incomeRegisterEntries = [];
    const legacyExpenseByTarget = {};

    monthReports.forEach((r) => {
      const branchName = getReportBranchName(r);

      if (!branchesMap[branchName]) {
        branchesMap[branchName] = { name: branchName, services: {} };
      }

      const svcType = getServiceLabel(r);
      if (!branchesMap[branchName].services[svcType]) {
        branchesMap[branchName].services[svcType] = [];
      }
      branchesMap[branchName].services[svcType].push(r);

      const a = r.attendance || {};
      const m = parseInt(a.men || 0, 10) || 0;
      const w = parseInt(a.women || 0, 10) || 0;
      const c = parseInt(a.children || 0, 10) || 0;
      const y = parseInt(a.youth || 0, 10) || 0;
      const visitors = parseInt(r.newVisitors ?? a.newVisitors ?? 0, 10) || 0;

      totalMen += m;
      totalWomen += w;
      totalChildren += c;
      totalYouth += y;
      totalNewVisitors += visitors;

      const income = (r.financials?.income || []).reduce(
        (sum, row) => sum + getIncomeRowAmountXcd(row),
        0
      );
      const reportDateObj = parseReportDate(r.date);
      const reportDateLabel = reportDateObj ? formatLocalDateKey(reportDateObj) : r.date || "";
      const serviceLabel = getServiceLabel(r);
      (r.financials?.income || []).forEach((row) => {
        const amount = getIncomeRowAmountXcd(row);
        if (!amount && !String(row.label || "").trim()) return;
        incomeRegisterEntries.push({
          date: reportDateLabel,
          branch: branchName,
          service: serviceLabel,
          source: getIncomePurpose(row),
          amount
        });
      });
      const expenseRows = (r.financials?.expenses || []).map((row) =>
        normalizeExpenseRow(row, branchName)
      );
      const expense = expenseRows.reduce(
        (sum, row) => sum + (parseFloat(row.amount || 0) || 0),
        0
      );

      totalIncome += income;
      totalExpenseFromReports += expense;
      incomeByBranch[branchName] = (incomeByBranch[branchName] || 0) + income;
      expenseRows.forEach((row) => {
        const amount = parseFloat(row.amount || 0) || 0;
        if (!amount) return;
        const target = resolveExpenseTargetLabel(row, branchName);
        legacyExpenseByTarget[target] = (legacyExpenseByTarget[target] || 0) + amount;
      });
    });

    const monthlyExpenseTotal = normalizedMonthlyExpenses.reduce(
      (sum, row) => sum + (parseFloat(row.amount || 0) || 0),
      0
    );
    const expenseByTarget = {};
    normalizedMonthlyExpenses.forEach((row) => {
      const amount = parseFloat(row.amount || 0) || 0;
      if (!amount) return;
      const purpose = getMonthlyExpensePurposeLabel(row);
      const key = `Purpose: ${purpose}`;
      expenseByTarget[key] = (expenseByTarget[key] || 0) + amount;
    });
    const useMonthlyExpenseRegister = normalizedMonthlyExpenses.length > 0;
    const totalExpense = useMonthlyExpenseRegister ? monthlyExpenseTotal : totalExpenseFromReports;
    const effectiveExpenseByTarget = useMonthlyExpenseRegister
      ? expenseByTarget
      : legacyExpenseByTarget;
    const netMovement = totalIncome - totalExpense;
    const closingBalance = broughtForward + netMovement;

    // Build branchSummaries (service-level stats)
    const branchSummaries = Object.values(branchesMap).map((b) => {
      const serviceTypes = Object.entries(b.services).map(([type, svcReports]) => {
        let totalAtt = 0;
        let minAtt = Number.POSITIVE_INFINITY;
        let maxAtt = 0;

        svcReports.forEach((r) => {
          const a = r.attendance || {};
          const t =
            (parseInt(a.men || 0, 10) || 0) +
            (parseInt(a.women || 0, 10) || 0) +
            (parseInt(a.children || 0, 10) || 0) +
            (parseInt(a.youth || 0, 10) || 0);
          totalAtt += t;
          if (t < minAtt) minAtt = t;
          if (t > maxAtt) maxAtt = t;
        });

        const count = svcReports.length;
        const avgAttendance = count ? totalAtt / count : 0;

        return {
          type,
          count,
          avgAttendance,
          minAttendance: minAtt === Number.POSITIVE_INFINITY ? 0 : minAtt,
          maxAttendance: maxAtt
        };
      });

      return {
        name: b.name,
        serviceTypes
      };
    });

    // Group reports by branch for the detailed table and sort each branch's reports by date
    const reportsByBranch = {};
    monthReports.forEach((r) => {
      const branchName = getReportBranchName(r);
      if (!reportsByBranch[branchName]) reportsByBranch[branchName] = [];
      reportsByBranch[branchName].push(r);
    });
    Object.values(reportsByBranch).forEach((list) => {
      list.sort((a, b) => {
        const ad = parseReportDate(a.date);
        const bd = parseReportDate(b.date);
        return (ad?.getTime() || 0) - (bd?.getTime() || 0);
      });
    });

    // Income by category across the month
    const incomeCategoryMap = {};
    monthReports.forEach((r) => {
      (r.financials?.income || []).forEach((row) => {
        const label = getIncomePurpose(row);
        const amt = getIncomeRowAmountXcd(row);
        incomeCategoryMap[label] = (incomeCategoryMap[label] || 0) + amt;
      });
    });
    const incomeByCategory = Object.entries(incomeCategoryMap).map(([label, total]) => ({
      label,
      total
    }));
    incomeRegisterEntries.sort((a, b) => {
      const ad = parseReportDate(a.date);
      const bd = parseReportDate(b.date);
      const dateDiff = (ad?.getTime() || 0) - (bd?.getTime() || 0);
      if (dateDiff !== 0) return dateDiff;
      return a.branch.localeCompare(b.branch);
    });

    // Data for attendance chart (attendance per date per branch)
    const branchNames = Object.values(branchesMap)
      .map((b) => b.name)
      .sort((a, b) => a.localeCompare(b));
    const attendanceByDate = {};
    monthReports.forEach((r) => {
      const dateObj = parseReportDate(r.date);
      if (!dateObj || Number.isNaN(dateObj.getTime())) return;
      const dateKey = formatLocalDateKey(dateObj);
      const branchName = getReportBranchName(r);
      const a = r.attendance || {};
      const totalAtt =
        (parseInt(a.men || 0, 10) || 0) +
        (parseInt(a.women || 0, 10) || 0) +
        (parseInt(a.children || 0, 10) || 0) +
        (parseInt(a.youth || 0, 10) || 0);
      if (!attendanceByDate[dateKey]) attendanceByDate[dateKey] = { date: dateKey };
      attendanceByDate[dateKey][branchName] =
        (attendanceByDate[dateKey][branchName] || 0) + totalAtt;
    });
    const attendanceSeries = Object.values(attendanceByDate).sort((a, b) => {
      const ad = parseReportDate(a.date);
      const bd = parseReportDate(b.date);
      return (ad?.getTime() || 0) - (bd?.getTime() || 0);
    });
    attendanceSeries.forEach((row) => {
      branchNames.forEach((branch) => {
        if (row[branch] == null) row[branch] = 0;
      });
    });

    // Notes trimmed for summary
    const notesForMonth = monthReports
      .filter((r) => r.notes && r.notes.trim())
      .map((r) => {
        const branchName = getReportBranchName(r);
        const parsed = parseReportDate(r.date);
        const d = parsed ? formatLocalDateKey(parsed) : "";
        const trimmed = r.notes.length > 220 ? r.notes.slice(0, 220) + "..." : r.notes;
        return {
          date: d,
          branch: branchName,
          note: trimmed
        };
      });

    const computedSummary = {
      monthReports,
      serviceRecordSummary: buildMonthlyServiceSummary(monthReports),
      monthlyReportOverview: buildMonthlyReportOverview(monthReports),
      branchSummaries,
      totalMen,
      totalWomen,
      totalChildren,
      totalYouth,
      totalNewVisitors,
      totalIncome,
      totalExpense,
      totalExpenseFromReports,
      totalExpenseFromMonthlyRegister: monthlyExpenseTotal,
      useMonthlyExpenseRegister,
      balanceBroughtForward: broughtForward,
      closingBalance,
      netMovement,
      monthlyExpenseEntries: normalizedMonthlyExpenses,
      serviceCount: monthReports.length,
      notesForMonth,
      attendanceSeries,
      branchNames,
      reportsByBranch,
      incomeByCategory,
      incomeByBranch,
      incomeRegisterEntries,
      expenseByTarget: effectiveExpenseByTarget,
      financialComparison: [
        { label: "Income", amount: totalIncome },
        { label: "Expenses", amount: totalExpense },
        { label: "Balance", amount: closingBalance }
      ]
    };
    return {
      ...computedSummary,
      ledgerEntries: buildFinancialLedgerEntries(computedSummary)
    };
  }, [reports, selectedMonth, monthlyExpenseRows, balanceBroughtForward]);


 const monthLabel = useMemo(() => {
  if (!selectedMonth || !selectedMonth.includes("-")) return selectedMonth;
  const [year, month] = selectedMonth.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1); // local date, no UTC bug
 return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}, [selectedMonth]);

  useEffect(() => {
    setAiActionMessage("");
    setAiReportError("");
  }, [selectedMonth]);

  useEffect(() => {
    let isMounted = true;

    const loadStoredAiReport = async () => {
      if (!countryKey || !canGenerateOfficialMonthlyReport) {
        setAiReportRecord(null);
        setLoadingAiReport(false);
        return;
      }

      setLoadingAiReport(true);
      try {
        const aiReportRef = doc(db, "monthly_ai_reports", `${countryKey}__${selectedMonth}`);
        const aiReportSnap = await getDoc(aiReportRef);
        if (!isMounted) return;

        setAiReportRecord(
          aiReportSnap.exists()
            ? normalizeMonthlyAiReport(aiReportSnap.id, aiReportSnap.data())
            : null
        );
      } catch (error) {
        console.error("Error loading AI monthly report:", error);
        if (!isMounted) return;
        setAiReportRecord(null);
        setAiReportError("Unable to load the saved AI monthly report.");
      } finally {
        if (isMounted) {
          setLoadingAiReport(false);
        }
      }
    };

    loadStoredAiReport();

    return () => {
      isMounted = false;
    };
  }, [selectedMonth, countryKey, canGenerateOfficialMonthlyReport]);

  // Load saved monthly letter and saved financial rows for the selected month.
  useEffect(() => {
    let isMounted = true;

    const loadMonthlyContext = async () => {
      if (!countryKey) {
        setCustomText("");
        setBalanceBroughtForward("");
        setMonthlyExpenseRows([defaultMonthlyExpenseRow(`${selectedMonth}-01`)]);
        return;
      }

      setLoadingSummary(true);
      setLoadingMonthlyExpenseRows(true);
      try {
        const summaryRef = doc(db, "monthly_summaries", `${countryKey}__${selectedMonth}`);
        const expensesQuery = query(
          collection(db, "monthly_expense_records"),
          where("countryKey", "==", countryKey),
          where("month", "==", selectedMonth)
        );

        const [summarySnap, expenseSnap] = await Promise.all([
          getDoc(summaryRef),
          getDocs(expensesQuery)
        ]);
        if (!isMounted) return;

        let legacyRows = [];
        if (summarySnap.exists()) {
          const data = summarySnap.data();
          setCustomText(data.text || "");
          const savedMode = data.printChartMode || (data.includeChartsInPrint ? "both" : "none");
          setPrintChartMode(savedMode);
          setBalanceBroughtForward(
            data.balanceBroughtForward != null ? String(data.balanceBroughtForward) : ""
          );
          legacyRows = Array.isArray(data.monthlyExpenses) ? data.monthlyExpenses : [];
        } else {
          setCustomText(buildMonthlyLetter(monthLabel, summary, countryLabel));
          setPrintChartMode("none");
          setBalanceBroughtForward("");
        }

        const savedRows = expenseSnap.docs
          .map((snap) =>
            normalizeMonthlyExpenseRow(
              {
                id: snap.id,
                ...snap.data()
              },
              selectedMonth
            )
          )
          .sort((a, b) => {
            const ad = parseReportDate(a.date);
            const bd = parseReportDate(b.date);
            const dateDiff = (ad?.getTime() || 0) - (bd?.getTime() || 0);
            if (dateDiff !== 0) return dateDiff;
            return getMonthlyExpensePurposeLabel(a).localeCompare(getMonthlyExpensePurposeLabel(b));
          });

        if (savedRows.length > 0) {
          setMonthlyExpenseRows(savedRows);
        } else if (legacyRows.length > 0) {
          setMonthlyExpenseRows(
            legacyRows.map((row) => normalizeMonthlyExpenseRow(row, selectedMonth))
          );
        } else {
          setMonthlyExpenseRows([defaultMonthlyExpenseRow(`${selectedMonth}-01`)]);
        }
      } catch (e) {
        console.error("Error loading monthly reporting context:", e);
        if (!isMounted) return;
        setCustomText(buildMonthlyLetter(monthLabel, summary, countryLabel));
        setBalanceBroughtForward("");
        setMonthlyExpenseRows([defaultMonthlyExpenseRow(`${selectedMonth}-01`)]);
      } finally {
        if (isMounted) {
          setLoadingSummary(false);
          setLoadingMonthlyExpenseRows(false);
        }
      }
    };

    loadMonthlyContext();

    return () => {
      isMounted = false;
    };
  }, [selectedMonth, monthLabel, countryKey, countryLabel]);


  const handleRegenerate = () => {
    if (!summary) return;
    const autoText = buildMonthlyLetter(monthLabel, summary, countryLabel);
    setCustomText(autoText);
  };

  const handleGenerateAiReport = async () => {
    if (!countryKey) {
      setAiReportError("Please set your country before generating a monthly report.");
      return;
    }
    if (!canGenerateOfficialMonthlyReport) {
      setAiReportError(
        "Only country-level report readers can generate the official monthly AI report."
      );
      return;
    }

    setGeneratingAiReport(true);
    setAiReportError("");
    setAiActionMessage("");
    try {
      const report = await requestMonthlyAiReportGeneration(app, {
        month: selectedMonth
      });
      setAiReportRecord(report);
      setAiActiveTab("enriched");
      setAiActionMessage("AI monthly report generated successfully.");
    } catch (error) {
      setAiReportError(formatMonthlyAiError(error));
    } finally {
      setGeneratingAiReport(false);
    }
  };

  const activeAiPanelText =
    aiActiveTab === "compiled"
      ? aiReportRecord?.rawCompiledReportText ||
        JSON.stringify(aiReportRecord?.structuredCompilation || {}, null, 2)
      : aiReportRecord?.enrichedReport || "";

  const handleCopyAiPanel = async () => {
    if (!activeAiPanelText.trim()) {
      setAiReportError("There is no report content available to copy.");
      return;
    }

    try {
      await copyTextToClipboard(activeAiPanelText);
      setAiActionMessage(
        aiActiveTab === "compiled"
          ? "Compiled monthly source data copied."
          : "AI-enriched monthly report copied."
      );
      setAiReportError("");
    } catch (error) {
      console.error("Copy AI report error:", error);
      setAiReportError("Unable to copy the current report view.");
    }
  };

  const handleDownloadAiPanel = () => {
    if (!activeAiPanelText.trim()) {
      setAiReportError("There is no report content available to download.");
      return;
    }

    const suffix = aiActiveTab === "compiled" ? "compiled-monthly-data" : "monthly-report";
    downloadTextFile(
      buildMonthlyAiFilename(countryKey, selectedMonth, suffix),
      activeAiPanelText
    );
    setAiActionMessage(
      aiActiveTab === "compiled"
        ? "Compiled monthly source data downloaded."
        : "AI-enriched monthly report downloaded."
    );
    setAiReportError("");
  };

  const handleUseAiAsLetterDraft = () => {
    const nextText = aiReportRecord?.enrichedReport || "";
    if (!nextText.trim()) {
      setAiReportError("Generate or load an AI report before updating the letter draft.");
      return;
    }

    if (
      customText.trim() &&
      customText.trim() !== nextText.trim() &&
      !window.confirm("Replace the current monthly letter draft with the AI-enriched report?")
    ) {
      return;
    }

    setCustomText(nextText);
    setAiActionMessage("The AI-enriched report has been loaded into the letter editor.");
    setAiReportError("");
  };

  const saveMonthlyLetter = async (notify = true) => {
    if (!summary) return false;
    if (!countryKey) {
      alert("Please set your country before saving.");
      return false;
    }
    setSavingSummary(true);
    try {
      const sanitizedMonthlyExpenses = sanitizeMonthlyExpenseRows(
        monthlyExpenseRows,
        selectedMonth
      );

      for (const row of sanitizedMonthlyExpenses) {
        const validationError = validateMonthlyExpenseRow(row);
        if (validationError) {
          alert(validationError);
          return false;
        }
      }

      await setDoc(doc(db, "monthly_summaries", `${countryKey}__${selectedMonth}`), {
        text: customText,
        printChartMode,
        balanceBroughtForward: parseFloat(balanceBroughtForward || 0) || 0,
        monthlyExpenses: sanitizedMonthlyExpenses,
        updatedAt: new Date().toISOString(),
        month: selectedMonth,
        country: countryLabel,
        countryKey,
        savedBy: auth.currentUser?.email || null
      }, { merge: true });
      if (notify) alert("Monthly letter saved.");
      return true;
    } catch (e) {
      alert("Error saving letter: " + e.message);
      return false;
    } finally {
      setSavingSummary(false);
    }
  };

  const saveMonthlyExpenseRow = async (index, notify = true) => {
    if (!canManageMonthlyExpenses) return false;
    if (!countryKey) {
      alert("Please set your country before saving.");
      return false;
    }

    const row = normalizeMonthlyExpenseRow(monthlyExpenseRows[index], selectedMonth);
    const validationError = validateMonthlyExpenseRow(row);
    if (validationError) {
      alert(validationError);
      return false;
    }

    const rowIdentifier = row.id || row.localId || String(index);
    setSavingExpenseRowId(rowIdentifier);
    try {
      const now = new Date().toISOString();
      const rowId = row.id || doc(collection(db, "monthly_expense_records")).id;
      await setDoc(
        doc(db, "monthly_expense_records", rowId),
        {
          month: selectedMonth,
          country: countryLabel,
          countryKey,
          date: row.date,
          purpose: row.purpose,
          otherDetails: row.otherDetails?.trim() || "",
          amount: parseFloat(row.amount || 0) || 0,
          createdAt: row.createdAt || now,
          updatedAt: now,
          savedBy: auth.currentUser?.email || null
        },
        { merge: true }
      );

      setMonthlyExpenseRows((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? normalizeMonthlyExpenseRow(
                {
                  ...item,
                  id: rowId,
                  createdAt: item.createdAt || now,
                  updatedAt: now,
                  savedBy: auth.currentUser?.email || ""
                },
                selectedMonth
              )
            : item
        )
      );
      if (notify) alert("Expense row saved.");
      return true;
    } catch (e) {
      alert("Error saving expense row: " + e.message);
      return false;
    } finally {
      setSavingExpenseRowId("");
    }
  };

  const saveAllMonthlyExpenseRows = async (notify = true) => {
    if (!canManageMonthlyExpenses) return false;
    if (!countryKey) {
      alert("Please set your country before saving.");
      return false;
    }

    const normalizedRows = (monthlyExpenseRows || []).map((row) =>
      normalizeMonthlyExpenseRow(row, selectedMonth)
    );
    const meaningfulRows = normalizedRows.filter((row) => isMonthlyExpenseRowMeaningful(row));

    for (const row of meaningfulRows) {
      const validationError = validateMonthlyExpenseRow(row);
      if (validationError) {
        alert(validationError);
        return false;
      }
    }

    if (meaningfulRows.length === 0) {
      if (notify) alert("There are no expense rows to save.");
      return true;
    }

    setSavingExpenseRowId("__all__");
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const nextRows = normalizedRows.map((row) => {
        if (!isMonthlyExpenseRowMeaningful(row)) return row;
        const rowId = row.id || doc(collection(db, "monthly_expense_records")).id;
        batch.set(
          doc(db, "monthly_expense_records", rowId),
          {
            month: selectedMonth,
            country: countryLabel,
            countryKey,
            date: row.date,
            purpose: row.purpose,
            otherDetails: row.otherDetails?.trim() || "",
            amount: parseFloat(row.amount || 0) || 0,
            createdAt: row.createdAt || now,
            updatedAt: now,
            savedBy: auth.currentUser?.email || null
          },
          { merge: true }
        );
        return normalizeMonthlyExpenseRow(
          {
            ...row,
            id: rowId,
            createdAt: row.createdAt || now,
            updatedAt: now,
            savedBy: auth.currentUser?.email || ""
          },
          selectedMonth
        );
      });

      await batch.commit();
      setMonthlyExpenseRows(nextRows);
      if (notify) alert("All expense rows saved.");
      return true;
    } catch (e) {
      alert("Error saving all expense rows: " + e.message);
      return false;
    } finally {
      setSavingExpenseRowId("");
    }
  };

  const handleDeleteMonthlyExpenseRow = async (index) => {
    const row = normalizeMonthlyExpenseRow(monthlyExpenseRows[index], selectedMonth);
    if (!canManageMonthlyExpenses) return;

    if (!row.id) {
      removeMonthlyExpenseRow(index);
      return;
    }

    if (!window.confirm("Delete this saved expense row?")) return;
    setSavingExpenseRowId(row.id);
    try {
      await deleteDoc(doc(db, "monthly_expense_records", row.id));
      removeMonthlyExpenseRow(index);
    } catch (e) {
      alert("Error deleting expense row: " + e.message);
    } finally {
      setSavingExpenseRowId("");
    }
  };

  const saveMonthlyFinancialEntry = async (notify = true) => {
    const savedRows = await saveAllMonthlyExpenseRows(false);
    if (!savedRows) return false;
    const saved = await saveMonthlyLetter(false);
    if (!saved) return false;
    if (!countryKey) {
      alert("Please set your country before saving.");
      return false;
    }

    setSavingFinancialEntry(true);
    try {
      await setDoc(doc(db, "monthly_financial_entries", `${countryKey}__${selectedMonth}`), {
        month: selectedMonth,
        monthLabel,
        country: countryLabel,
        countryKey,
        balanceBroughtForward: Number(summary.balanceBroughtForward || 0),
        totalIncome: Number(summary.totalIncome || 0),
        totalExpense: Number(summary.totalExpense || 0),
        netMovement: Number(summary.netMovement || 0),
        closingBalance: Number(summary.closingBalance || 0),
        incomeRegisterEntries: summary.incomeRegisterEntries || [],
        monthlyExpenseEntries: summary.monthlyExpenseEntries || [],
        serviceCount: Number(summary.serviceCount || 0),
        sourceReportCount: Number(summary.monthReports?.length || 0),
        savedBy: auth.currentUser?.email || null,
        savedAt: new Date().toISOString()
      }, { merge: true });
      if (notify) alert("Monthly financial entry saved.");
      return true;
    } catch (e) {
      alert("Error saving monthly financial entry: " + e.message);
      return false;
    } finally {
      setSavingFinancialEntry(false);
    }
  };

  const handleSaveLetter = async () => {
    await saveMonthlyLetter(true);
  };

  const handleEmailLetter = async () => {
    const saved = await saveMonthlyLetter(false);
    if (!saved) return;
    const subject = `Monthly Report - ${monthLabel} (${countryLabel})`;
    const body = buildMonthlyEmailBody(monthLabel, countryLabel, summary, customText);
    openMailTo(subject, body);
  };

  const buildFinancialStatementText = () => {
    const lines = [
      `Monthly Financial Statement`,
      ``,
      `Country: ${countryLabel}`,
      `Month: ${monthLabel}`,
      `Balance Brought Forward (XCD): ${Number(summary.balanceBroughtForward || 0).toFixed(2)}`,
      `Total Income (XCD): ${Number(summary.totalIncome || 0).toFixed(2)}`,
      `Total Expenses (XCD): ${Number(summary.totalExpense || 0).toFixed(2)}`,
      `Net Movement (XCD): ${Number(summary.netMovement || 0).toFixed(2)}`,
      `Closing Balance (XCD): ${Number(summary.closingBalance || 0).toFixed(2)}`,
      ``,
      `Income Register (Auto-imported from services)`
    ];
    if (!summary.incomeRegisterEntries || summary.incomeRegisterEntries.length === 0) {
      lines.push(`- No income entries imported from services.`);
    } else {
      summary.incomeRegisterEntries.forEach((row) => {
        lines.push(
          `- ${row.date || "-"} | ${row.branch || "-"} | ${row.service || "-"} | ${row.source || "Income"} | XCD ${(parseFloat(row.amount || 0) || 0).toFixed(2)}`
        );
      });
    }
    lines.push(
      ``,
      `Expense Register`
    );
    if (!summary.monthlyExpenseEntries || summary.monthlyExpenseEntries.length === 0) {
      lines.push(`- No monthly expense entries.`);
    } else {
      summary.monthlyExpenseEntries.forEach((row) => {
        lines.push(
          `- ${row.date || "-"} | ${getMonthlyExpensePurposeLabel(row)} | XCD ${(
            parseFloat(row.amount || 0) || 0
          ).toFixed(2)}`
        );
      });
    }
    lines.push(``, `Financial Ledger`);
    if (!summary.ledgerEntries || summary.ledgerEntries.length === 0) {
      lines.push(`- No income or expenditure entries for this month.`);
    } else {
      summary.ledgerEntries.forEach((entry) => {
        lines.push(
          `- ${entry.date || "-"} | ${entry.details} | Income: ${
            entry.income ? entry.income.toFixed(2) : "-"
          } | Expenditure: ${
            entry.expenditure ? entry.expenditure.toFixed(2) : "-"
          } | Balance: ${entry.runningBalance.toFixed(2)}`
        );
      });
    }
    return lines.join("\n");
  };

  const handleEmailFinancialStatement = async () => {
    const saved = await saveMonthlyFinancialEntry(false);
    if (!saved) return;
    const subject = `Financial Statement - ${monthLabel} (${countryLabel})`;
    openMailTo(subject, buildFinancialStatementText());
  };

  const handleSaveFinancialEntry = async () => {
    await saveMonthlyFinancialEntry(true);
  };

  const handleDownloadFinancialStatement = async () => {
    const saved = await saveMonthlyFinancialEntry(false);
    if (!saved) return;
    const text = buildFinancialStatementText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-statement-${countryKey || "country"}-${selectedMonth}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadServiceRecordsCsv = () => {
    const csv = buildServiceRecordsCsv(summary.monthReports || []);
    downloadCsv(
      `service-records-${countryKey || "country"}-${selectedMonth}.csv`,
      csv
    );
  };

  const handlePrintFinancialStatement = async () => {
    const saved = await saveMonthlyFinancialEntry(false);
    if (!saved) return;
    const win = window.open("", "_blank");
    if (!win) {
      alert("Pop-up blocked. Please allow pop-ups and try again.");
      return;
    }
    const incomeRows = (summary.incomeRegisterEntries || [])
      .map((row) => {
        const amount = (parseFloat(row.amount || 0) || 0).toFixed(2);
        return `<tr><td>${row.date || "-"}</td><td>${row.branch || "-"}</td><td>${row.service || "-"}</td><td>${row.source || "Income"}</td><td style="text-align:right">${amount}</td></tr>`;
      })
      .join("");
    const expenseRows = (summary.monthlyExpenseEntries || [])
      .map((row) => {
        const purpose = getMonthlyExpensePurposeLabel(row);
        const details =
          row.purpose === "Other" ? "-" : row.otherDetails || "-";
        const amount = (parseFloat(row.amount || 0) || 0).toFixed(2);
        return `<tr><td>${row.date || "-"}</td><td>${purpose}</td><td>${details}</td><td style="text-align:right">${amount}</td></tr>`;
      })
      .join("");

    const ledgerRows = (summary.ledgerEntries || [])
      .map((entry) => {
        return `<tr>
          <td>${entry.date || "-"}</td>
          <td>${entry.details}</td>
          <td style="text-align:right">${entry.income ? entry.income.toFixed(2) : "-"}</td>
          <td style="text-align:right">${entry.expenditure ? entry.expenditure.toFixed(2) : "-"}</td>
          <td style="text-align:right">${entry.runningBalance.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const totalIncome = Number(summary.totalIncome || 0);
    const totalExpense = Number(summary.totalExpense || 0);
    const netMovement = Number(summary.netMovement || 0);
    const closingBalance = Number(summary.closingBalance || 0);
    const openingBalance = Number(summary.balanceBroughtForward || 0);
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Financial Statement - ${monthLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1, h2 { margin: 0 0 12px; }
            .meta { margin-bottom: 16px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; }
            .totals-row td { font-weight: 700; background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Monthly Financial Statement</h1>
          <div class="meta">
            <div><strong>Country:</strong> ${countryLabel}</div>
            <div><strong>Month:</strong> ${monthLabel}</div>
            <div><strong>Balance Brought Forward (XCD):</strong> ${openingBalance.toFixed(2)}</div>
            <div><strong>Total Income (XCD):</strong> ${totalIncome.toFixed(2)}</div>
            <div><strong>Total Expenditure (XCD):</strong> ${totalExpense.toFixed(2)}</div>
            <div><strong>Net Movement (XCD):</strong> ${netMovement.toFixed(2)}</div>
            <div><strong>Closing Balance (XCD):</strong> ${closingBalance.toFixed(2)}</div>
          </div>
          <h2>Financial Ledger (Income, Expenditure, Balance)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th style="text-align:right">Income (XCD)</th>
                <th style="text-align:right">Expenditure (XCD)</th>
                <th style="text-align:right">Balance (XCD)</th>
              </tr>
            </thead>
            <tbody>${ledgerRows || "<tr><td colspan='5'>No income or expenditure entries for this month.</td></tr>"}</tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="2">Totals</td>
                <td style="text-align:right">${totalIncome.toFixed(2)}</td>
                <td style="text-align:right">${totalExpense.toFixed(2)}</td>
                <td style="text-align:right">${closingBalance.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <h2>Income Register (Auto-imported from services)</h2>
          <table>
            <thead><tr><th>Date</th><th>Branch</th><th>Service</th><th>Source</th><th style="text-align:right">Amount (XCD)</th></tr></thead>
            <tbody>${incomeRows || "<tr><td colspan='5'>No income entries imported from services.</td></tr>"}</tbody>
          </table>
          <h2>Expense Register</h2>
          <table>
            <thead><tr><th>Date</th><th>Purpose</th><th>Details</th><th style="text-align:right">Expenditure (XCD)</th></tr></thead>
            <tbody>${expenseRows || "<tr><td colspan='4'>No monthly expense entries.</td></tr>"}</tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3">Total Expenditure</td>
                <td style="text-align:right">${totalExpense.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  useEffect(() => {
    if (initialSection !== "financial-entry" || !financialEntryRef.current) return;
    financialEntryRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialSection, jumpToken]);

  if (!summary) {
    return (
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart2 className="text-blue-700" />
              Monthly Analytics
            </h2>
            <p className="text-sm text-slate-500">
              Select a month and ensure there are reports saved for that period.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Month:</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="px-2 py-2 rounded border text-slate-600 hover:bg-slate-100"
                aria-label="Previous month"
                onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
              >
                ‹
              </button>
              <input
                type="month"
                className="border rounded px-3 py-2 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
              <button
                type="button"
                className="px-2 py-2 rounded border text-slate-600 hover:bg-slate-100"
                aria-label="Next month"
                onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
              >
                ›
              </button>
            </div>
          </div>
        </div>
        <p className="mt-6 text-slate-500 text-sm">
          No reports found for the selected month.
        </p>
      </Card>
    );
  }

  const includeAttendanceInPrint = printChartMode !== "none";
  const includeIncomeInPrint = printChartMode === "both";
  const isFinancialEntryOnly = initialSection === "financial-entry";

  const ChartsSection = () => (
    <>
      <Card className="p-4">
        <h3 className="font-semibold mb-2 text-slate-800">Key Figures</h3>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase">Total Attendance</p>
            <p className="text-lg font-bold">
              {summary.totalMen + summary.totalWomen + summary.totalChildren}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Men / Women / Children</p>
            <p className="text-sm">
              {summary.totalMen} / {summary.totalWomen} / {summary.totalChildren}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">New Visitors</p>
            <p className="text-lg font-bold">{summary.totalNewVisitors || 0}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Income (XCD)</p>
            <p className="text-lg font-bold">{summary.totalIncome.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Expenses (XCD)</p>
            <p className="text-lg font-bold">{summary.totalExpense.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Balance B/F (XCD)</p>
            <p className="text-lg font-bold">{Number(summary.balanceBroughtForward || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Net Movement (XCD)</p>
            <p className="text-lg font-bold">{Number(summary.netMovement || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Closing Balance (XCD)</p>
            <p className="text-lg font-bold">{Number(summary.closingBalance || 0).toFixed(2)}</p>
          </div>
        </div>
      </Card>

      <Card className={`p-6 ${includeIncomeInPrint ? "" : "print:hidden"}`}>
        <h3 className="font-semibold mb-4">Income vs Expenses vs Balance (XCD)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.financialComparison || []} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="amount" name="Amount" barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2 text-slate-800">Expense Breakdown (XCD)</h3>
        {Object.keys(summary.expenseByTarget || {}).length === 0 ? (
          <p className="text-sm text-slate-500">
            No expense lines recorded for this month.
          </p>
        ) : (
          <div className="overflow-auto rounded border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2">Target</th>
                  <th className="text-right px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.expenseByTarget)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([target, amount]) => (
                    <tr key={target} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2">{target}</td>
                      <td className="px-3 py-2 text-right">
                        {Number(amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Attendance by Branch</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={summary.attendanceSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) =>
                  (parseReportDate(value) || new Date(value)).toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "short"
                  })
                }
              />
              <YAxis />
              <Tooltip />
              <Legend />
              {summary.branchNames.map((branch, idx) => {
                const colors = [
                  "#0b3b66",
                  "#1e88e5",
                  "#43a047",
                  "#f4511e",
                  "#6d4c41",
                  "#8e24aa",
                  "#00897b",
                  "#c62828"
                ];
                return (
                  <Line
                    key={branch}
                    type="monotone"
                    dataKey={branch}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className={`p-6 ${includeIncomeInPrint ? "" : "print:hidden"}`}>
        <h3 className="font-semibold mb-4">Income by Category (XCD)</h3>
        {summary.incomeByCategory && summary.incomeByCategory.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.incomeByCategory} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total Income" barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No income records found for this month.
          </p>
        )}
      </Card>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Control bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div className="flex items-center gap-2">
          <BarChart2 className="text-blue-700" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {isFinancialEntryOnly ? "Monthly Financial Report" : "Monthly Report Letter"}
            </h2>
            <p className="text-sm text-slate-500">
              {isFinancialEntryOnly
                ? `Financial entry and statement for ${monthLabel}.`
                : `Auto-generated letter and statistics for ${monthLabel}.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Month:</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-2 py-2 rounded border text-slate-600 hover:bg-slate-100"
              aria-label="Previous month"
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
            >
              ‹
            </button>
            <input
              type="month"
              className="border rounded px-3 py-2 text-sm"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
            <button
              type="button"
              className="px-2 py-2 rounded border text-slate-600 hover:bg-slate-100"
              aria-label="Next month"
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
            >
              ›
            </button>
          </div>
          {!isFinancialEntryOnly && (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Print charts:</span>
                <button
                  type="button"
                  onClick={() => setPrintChartMode("none")}
                  className={`px-2 py-1 text-xs rounded border ${
                    printChartMode === "none"
                      ? "bg-blue-900 text-white border-blue-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={() => setPrintChartMode("graph")}
                  className={`px-2 py-1 text-xs rounded border ${
                    printChartMode === "graph"
                      ? "bg-blue-900 text-white border-blue-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Graph only
                </button>
                <button
                  type="button"
                  onClick={() => setPrintChartMode("both")}
                  className={`px-2 py-1 text-xs rounded border ${
                    printChartMode === "both"
                      ? "bg-blue-900 text-white border-blue-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Graph + chart
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCharts((v) => !v)}
                className="text-xs text-blue-700 hover:underline"
              >
                {showCharts ? "Hide charts" : "Show charts"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="printable-area space-y-6 print:space-y-4">
      <Card ref={financialEntryRef} className="p-6 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">Monthly Financial Entry</h3>
            <p className="text-sm text-slate-500">
              Service income is auto-updated whenever this page opens. Enter expenses in the table below and save one row at a time or the whole register together.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => saveAllMonthlyExpenseRows(true)}
              className="text-xs px-3 py-1"
              disabled={
                !canManageMonthlyExpenses ||
                savingSummary ||
                savingFinancialEntry ||
                savingExpenseRowId === "__all__"
              }
            >
              Save all expenses
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveFinancialEntry}
              className="text-xs px-3 py-1"
              disabled={
                savingSummary ||
                savingFinancialEntry ||
                savingExpenseRowId === "__all__"
              }
            >
              Save financial entry
            </Button>
            <Button variant="secondary" onClick={handleDownloadFinancialStatement} className="text-xs px-3 py-1">
              <Download size={14} /> Save statement file
            </Button>
            <Button variant="secondary" onClick={handleEmailFinancialStatement} className="text-xs px-3 py-1">
              Email financial statement
            </Button>
            <Button variant="secondary" onClick={handlePrintFinancialStatement} className="text-xs px-3 py-1">
              Print statement only
            </Button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <InputGroup label="Balance Brought Forward (XCD)">
            <input
              className="w-full border rounded px-3 py-2 text-sm text-right"
              value={balanceBroughtForward}
              onChange={(e) => setBalanceBroughtForward(e.target.value)}
              placeholder="0.00"
              disabled={!canManageMonthlyExpenses}
            />
          </InputGroup>
          <div className="md:col-span-2 rounded border border-slate-200 p-3 bg-slate-50 text-sm">
            <p><span className="font-semibold">Net movement:</span> XCD {Number(summary.netMovement || 0).toFixed(2)}</p>
            <p><span className="font-semibold">Closing balance:</span> XCD {Number(summary.closingBalance || 0).toFixed(2)}</p>
          </div>
        </div>
        <div className="overflow-auto rounded border border-slate-200">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Purpose</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Details</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Amount (XCD)</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {monthlyExpenseRows.map((row, idx) => {
                const rowKey = row.id || row.localId || String(idx);
                const isRowSaving =
                  savingExpenseRowId === rowKey || savingExpenseRowId === "__all__";
                const statusLabel = row.id
                  ? `Saved${row.updatedAt ? ` ${new Date(row.updatedAt).toLocaleString()}` : ""}`
                  : isMonthlyExpenseRowMeaningful(row)
                    ? "Unsaved changes"
                    : "Draft";

                return (
                  <tr key={rowKey} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={row.date || ""}
                        onChange={(e) => handleMonthlyExpenseChange(idx, "date", e.target.value)}
                        disabled={!canManageMonthlyExpenses || isRowSaving}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={row.purpose || ""}
                        onChange={(e) => handleMonthlyExpenseChange(idx, "purpose", e.target.value)}
                        disabled={!canManageMonthlyExpenses || isRowSaving}
                      >
                        <option value="">Select purpose</option>
                        {MONTHLY_EXPENSE_PURPOSE_OPTIONS.map((purpose) => (
                          <option key={purpose} value={purpose}>
                            {purpose}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={row.otherDetails || ""}
                        onChange={(e) => handleMonthlyExpenseChange(idx, "otherDetails", e.target.value)}
                        placeholder={
                          row.purpose === "Other"
                            ? "Required for Other"
                            : "Narration / purpose details"
                        }
                        disabled={!canManageMonthlyExpenses || isRowSaving}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm text-right"
                        value={row.amount}
                        onChange={(e) => handleMonthlyExpenseChange(idx, "amount", e.target.value)}
                        placeholder="0.00"
                        disabled={!canManageMonthlyExpenses || isRowSaving}
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">
                      {statusLabel}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          onClick={() => saveMonthlyExpenseRow(idx, true)}
                          disabled={!canManageMonthlyExpenses || isRowSaving}
                        >
                          Save row
                        </button>
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                          onClick={() => handleDeleteMonthlyExpenseRow(idx)}
                          disabled={!canManageMonthlyExpenses || isRowSaving}
                        >
                          {row.id ? "Delete" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="mt-3 text-xs text-blue-700 hover:underline"
          onClick={addMonthlyExpenseRow}
          disabled={!canManageMonthlyExpenses || savingExpenseRowId === "__all__"}
        >
          + Add monthly expense
        </button>
        {loadingMonthlyExpenseRows && (
          <p className="mt-2 text-xs text-slate-500">Loading saved financial rows...</p>
        )}
        {!canManageMonthlyExpenses && (
          <p className="mt-2 text-xs text-slate-500">
            Only Admin, Vetting Committee Chairman, or Finance Reporter can edit the monthly expense register.
          </p>
        )}
      </Card>

      {!isFinancialEntryOnly && (
      <>
      <Card className="p-6 no-print">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <FileText size={18} className="text-blue-700" />
              AI Monthly Report
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Generate a polished monthly report from submitted data. The AI report is produced
              from backend-only OpenAI calls and the source data remains saved separately for
              traceability.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={handleGenerateAiReport}
              className="text-xs px-3 py-1"
              disabled={
                generatingAiReport ||
                loadingAiReport ||
                loadingSummary ||
                !canGenerateOfficialMonthlyReport
              }
            >
              {generatingAiReport ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  Generating...
                </>
              ) : aiReportRecord?.enrichedReport ? (
                "Regenerate"
              ) : (
                "Generate Monthly Report"
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={handleCopyAiPanel}
              className="text-xs px-3 py-1"
              disabled={!aiReportRecord}
            >
              {aiActiveTab === "compiled" ? "Copy compiled data" : "Copy report"}
            </Button>
              <Button
                variant="secondary"
                onClick={handleDownloadAiPanel}
                className="text-xs px-3 py-1"
                disabled={!aiReportRecord}
            >
              <Download size={14} />
              {aiActiveTab === "compiled" ? "Save compiled data" : "Save report file"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleUseAiAsLetterDraft}
              className="text-xs px-3 py-1"
              disabled={!aiReportRecord?.enrichedReport}
            >
              Use as letter draft
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadServiceRecordsCsv}
              className="text-xs px-3 py-1"
            >
              <Download size={14} />
              Service CSV
            </Button>
          </div>
        </div>

        {!canGenerateOfficialMonthlyReport && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Only Admin, Vetting Committee Chairman, or Finance Reporter roles can generate the
            official monthly AI report because it uses country-wide submitted entries.
          </div>
        )}

        {canGenerateOfficialMonthlyReport && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-4">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                  aiReportRecord?.status === "ready"
                    ? "bg-green-50 text-green-700"
                    : aiReportRecord?.status === "failed"
                      ? "bg-red-50 text-red-700"
                      : aiReportRecord?.status === "generating" || generatingAiReport
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-700"
                }`}
              >
                Status: {generatingAiReport ? "generating" : aiReportRecord?.status || "not generated"}
              </span>
              <span>
                Source entries: {aiReportRecord?.sourceReportCount ?? summary.monthReports?.length ?? 0}
              </span>
              {aiReportRecord?.generatedAt && (
                <span>Generated: {new Date(aiReportRecord.generatedAt).toLocaleString()}</span>
              )}
              {aiReportRecord?.generatedBy && (
                <span>Generated by: {aiReportRecord.generatedBy}</span>
              )}
              {aiReportRecord?.model && <span>Model: {aiReportRecord.model}</span>}
            </div>

            {aiReportError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {aiReportError}
              </div>
            )}

            {!aiReportError && aiActionMessage && (
              <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {aiActionMessage}
              </div>
            )}

            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAiActiveTab("enriched")}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  aiActiveTab === "enriched"
                    ? "border-blue-900 bg-blue-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Enriched Report
              </button>
              <button
                type="button"
                onClick={() => setAiActiveTab("compiled")}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  aiActiveTab === "compiled"
                    ? "border-blue-900 bg-blue-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Raw Compiled Data
              </button>
            </div>

            {loadingAiReport ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                Loading saved AI monthly report...
              </div>
            ) : aiReportRecord ? (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
                  {aiActiveTab === "compiled"
                    ? "Structured source data saved with the generated report"
                    : "AI-enriched monthly report"}
                </div>
                <div className="bg-white px-4 py-4">
                  <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 font-sans">
                    {activeAiPanelText || "No content saved for this view."}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No AI monthly report has been generated for {monthLabel} yet.
              </div>
            )}
          </>
        )}
      </Card>

      {/* Letter editor */}
      <Card className="p-8 print:p-4 bg-white print:shadow-none print:border-none monthly-letter-card">
  {/* On-screen controls (hidden when printing) */}
  <div className="no-print flex justify-between items-center mb-4">
    <h3 className="font-semibold text-slate-800">Written Monthly Letter</h3>
    <div className="flex gap-2 print:hidden">
      <Button variant="secondary" onClick={handleRegenerate} className="text-xs px-3 py-1">
        Regenerate from data
      </Button>
      <Button
        variant="secondary"
        onClick={handleSaveLetter}
        className="text-xs px-3 py-1"
      >
        Save letter
      </Button>
      <Button
        variant="secondary"
        onClick={handleEmailLetter}
        className="text-xs px-3 py-1"
      >
        Email letter
      </Button>
      <Button variant="primary" onClick={() => window.print()} className="text-xs px-3 py-1">
        <Printer size={14} /> Print letter
      </Button>
    </div>
  </div>

  {/* ---- Printable letterhead & address (printed output begins here) ---- */}

<div className="printable-letter">
  <div className="letter-print-area">
    <div className="mb-6 print:mb-3">
  <img
    src="/letterhead.png"
    alt="DLBC Letterhead"
    style={{
      width: "100%",
      height: "auto",
      display: "block"
    }}
  />
</div>
  {/* Recipient block + date */}
    <div className="mb-4 print:mb-2 text-[13pt] letter-body">
      <div style={{ textAlign: "right", marginBottom: 12 }}>
      {summary.monthReports[0]?.date
      ? parseReportDate(summary.monthReports[0].date)?.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    : ""}
    </div>
    <div>
        <div>The Church Secretary</div>
        <div>DLBC Headquarters,</div>
        <div>Gbagada, Nigeria.</div>

        <div style={{ marginTop: 12, fontWeight: 700 }}>
          Submitted By: Pastor Joshua Oluremi Alabi
        </div>
        <div>National Overseer, Deeper Life Bible Church, Dominica</div>
      </div>
    </div>

    {/* Main title */}
    <div className="mb-3 print:mb-2">
      <h2 style={{ color: "#0b3b66", fontSize: "16pt", fontWeight: 700 }}>
        REPORT OF DEEPER LIFE BIBLE CHURCH {countryLabel.toUpperCase()} ACTIVITIES – {monthLabel.toUpperCase()}
      </h2>
    </div>

    {/* Editable letter body (serif, bigger) */}
    <section className="mb-6 print:mb-3">
  <div
    contentEditable
    suppressContentEditableWarning
    className="letter-body editable-letter"
    onInput={(e) => setCustomText(e.currentTarget.innerText)}
    style={{
      fontSize: "15pt",
      fontFamily: "Times New Roman, serif",
      lineHeight: "1.6",
      whiteSpace: "pre-wrap"
    }}
  >
    {customText}
  </div>
 </section>
</div>
</div>
</Card>

<Card className="p-6 print:p-3 print:shadow-none print:border-none monthly-table-card">
  <h3 className="font-semibold mb-4 text-slate-800">
    Report-Ready Monthly Statistics
  </h3>
  <div className="grid md:grid-cols-5 gap-3 text-sm mb-5">
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase font-semibold text-slate-500">Services</p>
      <p className="text-xl font-bold">{summary.serviceRecordSummary?.totals?.serviceCount || 0}</p>
    </div>
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase font-semibold text-slate-500">Total Attendance</p>
      <p className="text-xl font-bold">{summary.serviceRecordSummary?.totals?.attendance || 0}</p>
    </div>
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase font-semibold text-slate-500">New Visitors</p>
      <p className="text-xl font-bold">{summary.serviceRecordSummary?.totals?.newVisitors || 0}</p>
    </div>
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase font-semibold text-slate-500">Youth</p>
      <p className="text-xl font-bold">{summary.serviceRecordSummary?.totals?.youth || 0}</p>
    </div>
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase font-semibold text-slate-500">Income</p>
      <p className="text-xl font-bold">
        XCD {Number(summary.serviceRecordSummary?.totals?.income || 0).toFixed(2)}
      </p>
    </div>
  </div>

  <div className="mb-6 rounded border border-blue-100 bg-blue-50 p-4 text-sm">
    <div className="grid md:grid-cols-4 gap-3">
      <div>
        <p className="text-xs uppercase font-semibold text-blue-800">Total Services</p>
        <p className="text-xl font-bold text-blue-950">
          {summary.monthlyReportOverview?.overall?.serviceCount || 0}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase font-semibold text-blue-800">Cumulative Attendance</p>
        <p className="text-xl font-bold text-blue-950">
          {summary.monthlyReportOverview?.overall?.attendance?.total || 0}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase font-semibold text-blue-800">Average Attendance</p>
        <p className="text-xl font-bold text-blue-950">
          {(summary.monthlyReportOverview?.overall?.averageAttendance || 0).toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase font-semibold text-blue-800">Calculation</p>
        <p className="text-base font-semibold text-blue-950">
          {summary.monthlyReportOverview?.overall?.calculation || "0 / 0 = 0.0"}
        </p>
      </div>
    </div>
  </div>

  <div className="mb-6 overflow-auto rounded border border-slate-200">
    <table className="w-full text-xs md:text-sm">
      <thead className="bg-slate-100">
        <tr>
          <th className="px-2 py-2 text-left">Location</th>
          <th className="px-2 py-2 text-left">Service Type</th>
          <th className="px-2 py-2 text-right">Held</th>
          <th className="px-2 py-2 text-right">Men</th>
          <th className="px-2 py-2 text-right">Women</th>
          <th className="px-2 py-2 text-right">Children</th>
          <th className="px-2 py-2 text-right">Youth</th>
          <th className="px-2 py-2 text-right">Visitors</th>
          <th className="px-2 py-2 text-right">Cumulative</th>
          <th className="px-2 py-2 text-left">Average Calculation</th>
          <th className="px-2 py-2 text-right">Average</th>
          <th className="px-2 py-2 text-right">Min</th>
          <th className="px-2 py-2 text-right">Max</th>
        </tr>
      </thead>
      <tbody>
        {(summary.monthlyReportOverview?.branchServiceTypes || []).length === 0 ? (
          <tr>
            <td className="px-2 py-3 text-slate-500" colSpan={13}>
              No service overview rows available for this month.
            </td>
          </tr>
        ) : (
          summary.monthlyReportOverview.branchServiceTypes.map((row) => (
            <tr key={`${row.branch}-${row.serviceType}`} className="border-t border-slate-100">
              <td className="px-2 py-2 whitespace-nowrap">{row.branch}</td>
              <td className="px-2 py-2 whitespace-nowrap">{row.serviceType}</td>
              <td className="px-2 py-2 text-right">{row.serviceCount}</td>
              <td className="px-2 py-2 text-right">{row.attendance.men}</td>
              <td className="px-2 py-2 text-right">{row.attendance.women}</td>
              <td className="px-2 py-2 text-right">{row.attendance.children}</td>
              <td className="px-2 py-2 text-right">{row.attendance.youth}</td>
              <td className="px-2 py-2 text-right">{row.attendance.newVisitors}</td>
              <td className="px-2 py-2 text-right font-semibold">{row.attendance.total}</td>
              <td className="px-2 py-2 whitespace-nowrap">{row.calculation}</td>
              <td className="px-2 py-2 text-right">{row.averageAttendance.toFixed(1)}</td>
              <td className="px-2 py-2 text-right">{row.minAttendance}</td>
              <td className="px-2 py-2 text-right">{row.maxAttendance}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>

  <div className="grid lg:grid-cols-2 gap-5">
    <div className="overflow-auto rounded border border-slate-200">
      <table className="w-full text-xs md:text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-2 py-2 text-left">Branch</th>
            <th className="px-2 py-2 text-right">Services</th>
            <th className="px-2 py-2 text-right">Attendance</th>
            <th className="px-2 py-2 text-right">Visitors</th>
            <th className="px-2 py-2 text-right">Income</th>
          </tr>
        </thead>
        <tbody>
          {(summary.serviceRecordSummary?.branches || []).map((branch) => (
            <tr key={branch.branch} className="border-t border-slate-100">
              <td className="px-2 py-2">{branch.branch}</td>
              <td className="px-2 py-2 text-right">{branch.serviceCount}</td>
              <td className="px-2 py-2 text-right">{branch.attendance.total}</td>
              <td className="px-2 py-2 text-right">{branch.newVisitors}</td>
              <td className="px-2 py-2 text-right">{branch.totalIncome.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="overflow-auto rounded border border-slate-200">
      <table className="w-full text-xs md:text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-2 py-2 text-left">Country Service Type</th>
            <th className="px-2 py-2 text-right">Held</th>
            <th className="px-2 py-2 text-right">Avg</th>
            <th className="px-2 py-2 text-right">Min</th>
            <th className="px-2 py-2 text-right">Max</th>
          </tr>
        </thead>
        <tbody>
          {(summary.serviceRecordSummary?.countryServiceTypes || []).map((service) => (
            <tr key={service.serviceType} className="border-t border-slate-100">
              <td className="px-2 py-2">{service.serviceType}</td>
              <td className="px-2 py-2 text-right">{service.count}</td>
              <td className="px-2 py-2 text-right">{service.averageAttendance.toFixed(1)}</td>
              <td className="px-2 py-2 text-right">{service.minAttendance}</td>
              <td className="px-2 py-2 text-right">{service.maxAttendance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>

  {(summary.serviceRecordSummary?.specialProgrammes || []).length > 0 && (
    <div className="mt-5">
      <h4 className="font-semibold mb-2 text-slate-700">Special Programmes / Outreach</h4>
      <div className="overflow-auto rounded border border-slate-200">
        <table className="w-full text-xs md:text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-2 py-2 text-left">Date</th>
              <th className="px-2 py-2 text-left">Branch</th>
              <th className="px-2 py-2 text-left">Programme</th>
              <th className="px-2 py-2 text-right">Attendance</th>
              <th className="px-2 py-2 text-right">Visitors</th>
              <th className="px-2 py-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {summary.serviceRecordSummary.specialProgrammes.map((programme, index) => (
              <tr key={`${programme.date}-${programme.title}-${index}`} className="border-t border-slate-100">
                <td className="px-2 py-2 whitespace-nowrap">{programme.date}</td>
                <td className="px-2 py-2">{programme.location}</td>
                <td className="px-2 py-2">{programme.title || programme.type}</td>
                <td className="px-2 py-2 text-right">{programme.attendance?.total || 0}</td>
                <td className="px-2 py-2 text-right">{programme.newVisitors || 0}</td>
                <td className="px-2 py-2">{programme.remarks || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )}
</Card>

{/* Detailed table of all services in the month */}
<Card className="p-6 print:p-3 print:shadow-none print:border-none print-page-break monthly-table-card">
  <h3 className="font-semibold mb-4 text-slate-800">
    Detailed Services for {monthLabel}
  </h3>

  {Object.keys(summary.reportsByBranch || {}).length === 0 ? (
    <p className="text-sm text-slate-500">
      No detailed records available for this month.
    </p>
  ) : (
    <div className="space-y-6">
      {Object.entries(summary.reportsByBranch).map(([branchName, branchReports]) => (
        <div key={branchName}>
          <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-1">
            <MapPin size={14} className="text-blue-700" />
            {branchName}
          </h4>
          <div className="overflow-auto rounded border border-slate-200">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Day</th>
                  <th className="px-2 py-1 text-left">Service</th>
                  <th className="px-2 py-1 text-right">Men</th>
                  <th className="px-2 py-1 text-right">Women</th>
                  <th className="px-2 py-1 text-right">Children</th>
                  <th className="px-2 py-1 text-right">Youth</th>
                  <th className="px-2 py-1 text-right">Visitors</th>
                  <th className="px-2 py-1 text-right">Total</th>
                  <th className="px-2 py-1 text-right">Income (XCD)</th>
                  <th className="px-2 py-1 text-left">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {branchReports.map((r) => {
                  const a = r.attendance || {};
                  const men = parseInt(a.men || 0, 10) || 0;
                  const women = parseInt(a.women || 0, 10) || 0;
                  const children = parseInt(a.children || 0, 10) || 0;
                  const youth = parseInt(a.youth || 0, 10) || 0;
                  const visitors = parseInt(r.newVisitors ?? a.newVisitors ?? 0, 10) || 0;
                  const total = men + women + children + youth;
                  const income = (r.financials?.income || []).reduce(
                    (sum, row) => sum + getIncomeRowAmountXcd(row),
                    0
                  );
                  const purposes = (r.financials?.income || [])
                    .filter((row) => row.label || row.purpose || getIncomeRowAmountXcd(row))
                    .map((row) => getIncomePurpose(row))
                    .join(", ");
                  const dateStr = r.date
                    ? parseReportDate(r.date)?.toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short"
                      })
                    : "";

                  return (
                    <tr key={r.id || r.createdAt} className="border-t border-slate-100">
                      <td className="px-2 py-1 whitespace-nowrap">{dateStr}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{r.dayOfWeek || getDayOfWeek(r.date)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {getServiceLabel(r)}
                      </td>
                      <td className="px-2 py-1 text-right">{men}</td>
                      <td className="px-2 py-1 text-right">{women}</td>
                      <td className="px-2 py-1 text-right">{children}</td>
                      <td className="px-2 py-1 text-right">{youth}</td>
                      <td className="px-2 py-1 text-right">{visitors}</td>
                      <td className="px-2 py-1 text-right font-semibold">{total}</td>
                      <td className="px-2 py-1 text-right">
                        {income ? income.toFixed(2) : "-"}
                      </td>
                      <td className="px-2 py-1">{purposes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td className="px-2 py-1 font-semibold" colSpan={9}>
                    Monthly Income Total
                  </td>
                  <td className="px-2 py-1 text-right font-semibold">
                    {(summary.incomeByBranch?.[branchName] || 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-1"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  )}
  
</Card>
      </>
      )}

<Card className="p-6 print:p-3 print:shadow-none print:border-none monthly-financial-card">
  <h3 className="font-semibold mb-3 text-slate-800">Monthly Financial Statement</h3>
  <div className="grid md:grid-cols-2 gap-2 text-sm mb-4">
    <p><span className="font-semibold">Balance Brought Forward (XCD):</span> {Number(summary.balanceBroughtForward || 0).toFixed(2)}</p>
    <p><span className="font-semibold">Total Income (XCD):</span> {Number(summary.totalIncome || 0).toFixed(2)}</p>
    <p><span className="font-semibold">Total Expenses (XCD):</span> {Number(summary.totalExpense || 0).toFixed(2)}</p>
    <p><span className="font-semibold">Net Movement (XCD):</span> {Number(summary.netMovement || 0).toFixed(2)}</p>
    <p><span className="font-semibold">Closing Balance (XCD):</span> {Number(summary.closingBalance || 0).toFixed(2)}</p>
  </div>
  <h4 className="font-semibold mb-2 text-slate-700">Financial Ledger</h4>
  <div className="overflow-auto rounded border border-slate-200 mb-4">
    <table className="w-full text-xs md:text-sm">
      <thead className="bg-slate-100">
        <tr>
          <th className="px-2 py-1 text-left">Date</th>
          <th className="px-2 py-1 text-left">Details</th>
          <th className="px-2 py-1 text-right">Income (XCD)</th>
          <th className="px-2 py-1 text-right">Expenditure (XCD)</th>
          <th className="px-2 py-1 text-right">Balance (XCD)</th>
        </tr>
      </thead>
      <tbody>
        {(summary.ledgerEntries || []).length === 0 ? (
          <tr>
            <td className="px-2 py-2 text-slate-500" colSpan={5}>
              No income or expenditure entries for this month.
            </td>
          </tr>
        ) : (
          summary.ledgerEntries.map((entry, idx) => (
            <tr key={`${entry.date || "ledger"}-${idx}`} className="border-t border-slate-100">
              <td className="px-2 py-1 whitespace-nowrap">{entry.date || "-"}</td>
              <td className="px-2 py-1">{entry.details}</td>
              <td className="px-2 py-1 text-right">
                {entry.income ? entry.income.toFixed(2) : "-"}
              </td>
              <td className="px-2 py-1 text-right">
                {entry.expenditure ? entry.expenditure.toFixed(2) : "-"}
              </td>
              <td className="px-2 py-1 text-right font-semibold">
                {entry.runningBalance.toFixed(2)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
  <h4 className="font-semibold mb-2 text-slate-700">Income Register (Auto-imported from services)</h4>
  <div className="overflow-auto rounded border border-slate-200 mb-4">
    <table className="w-full text-xs md:text-sm">
      <thead className="bg-slate-100">
        <tr>
          <th className="px-2 py-1 text-left">Date</th>
          <th className="px-2 py-1 text-left">Branch</th>
          <th className="px-2 py-1 text-left">Service</th>
          <th className="px-2 py-1 text-left">Source</th>
          <th className="px-2 py-1 text-right">Amount (XCD)</th>
        </tr>
      </thead>
      <tbody>
        {(summary.incomeRegisterEntries || []).length === 0 ? (
          <tr>
            <td className="px-2 py-2 text-slate-500" colSpan={5}>
              No income entries imported from services.
            </td>
          </tr>
        ) : (
          summary.incomeRegisterEntries.map((row, idx) => (
            <tr key={`${row.date || "income"}-${idx}`} className="border-t border-slate-100">
              <td className="px-2 py-1 whitespace-nowrap">{row.date || "-"}</td>
              <td className="px-2 py-1">{row.branch || "-"}</td>
              <td className="px-2 py-1">{row.service || "-"}</td>
              <td className="px-2 py-1">{row.source || "Income"}</td>
              <td className="px-2 py-1 text-right">
                {(parseFloat(row.amount || 0) || 0).toFixed(2)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
  <h4 className="font-semibold mb-2 text-slate-700">Expense Register</h4>
  <div className="overflow-auto rounded border border-slate-200">
    <table className="w-full text-xs md:text-sm">
      <thead className="bg-slate-100">
        <tr>
          <th className="px-2 py-1 text-left">Date</th>
          <th className="px-2 py-1 text-left">Purpose</th>
          <th className="px-2 py-1 text-left">Details</th>
          <th className="px-2 py-1 text-right">Amount (XCD)</th>
        </tr>
      </thead>
      <tbody>
        {(summary.monthlyExpenseEntries || []).length === 0 ? (
          <tr>
            <td className="px-2 py-2 text-slate-500" colSpan={4}>
              No monthly expenses entered.
            </td>
          </tr>
        ) : (
          summary.monthlyExpenseEntries.map((row, idx) => (
            <tr key={`${row.date || "row"}-${idx}`} className="border-t border-slate-100">
              <td className="px-2 py-1 whitespace-nowrap">{row.date || "-"}</td>
              <td className="px-2 py-1">
                {getMonthlyExpensePurposeLabel(row)}
              </td>
              <td className="px-2 py-1">{row.otherDetails || "-"}</td>
              <td className="px-2 py-1 text-right">
                {(parseFloat(row.amount || 0) || 0).toFixed(2)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
</Card>


      {/* Quick stats and charts */}
      {!isFinancialEntryOnly && (showCharts || includeAttendanceInPrint) && (
        <div
          className={
            showCharts
              ? (includeAttendanceInPrint ? "" : "print:hidden")
              : "hidden print:block"
          }
        >
          <ChartsSection />
        </div>
      )}
      </div>
    </div>
  );
}
