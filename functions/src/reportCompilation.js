const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
});

const normalizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value = "") => String(value || "").trim();

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

const getDayOfWeek = (dateValue = "") => {
  const parsed = parseReportDate(dateValue);
  if (!parsed) return "";
  return DAY_NAMES[parsed.getDay()] || "";
};

export const normalizeCountryKey = (value = "") => normalizeText(value).toLowerCase();

export const formatMonthLabel = (monthKey = "") => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    return monthKey;
  }
  const [year, month] = monthKey.split("-").map(Number);
  return MONTH_NAME_FORMATTER.format(new Date(year, month - 1, 1));
};

export const parseReportDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const normalized = normalizeText(value);
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const ddmmyyyy = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const mmddyyyy = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

export const getServiceLabel = (report = {}) => {
  const type = normalizeText(report.serviceType) || "Service";
  if (type === "Other Programme") {
    return normalizeText(report.otherServiceType) || "Other Programme";
  }
  return type;
};

export const getBranchLabel = (report = {}) => {
  if (report.branch === "Other") {
    return normalizeText(report.otherBranch) || "Other";
  }
  return normalizeText(report.branch) || "Unknown";
};

const normalizeIncomeItem = (row = {}) => ({
  label: normalizeText(row.label || row.purpose) || "Income",
  purpose:
    normalizeText(row.purpose) === "Other"
      ? normalizeText(row.otherPurpose || row.label) || "Other"
      : normalizeText(row.purpose || row.label) || "Income",
  amount: normalizeNumber(row.amount)
});

const normalizeEmbeddedExpenseItem = (row = {}, defaultBranch = "") => {
  const purpose = normalizeText(row.purpose);
  const purposeName = normalizeText(row.purposeName);
  const location = normalizeText(row.location) || defaultBranch;
  const locationName = normalizeText(row.locationName);
  const label = normalizeText(row.label);

  return {
    label: label || purposeName || purpose || "Expense",
    amount: normalizeNumber(row.amount),
    purpose: purposeName || purpose || "",
    location: locationName || location || "",
    details: normalizeText(row.otherDetails)
  };
};

export const normalizeMonthlyExpenseEntry = (row = {}) => ({
  id: normalizeText(row.id),
  date: normalizeText(row.date),
  purpose: normalizeText(row.purpose) || "Expense",
  details: normalizeText(row.otherDetails),
  amount: normalizeNumber(row.amount)
});

export const filterReportsForMonth = (reports = [], monthKey = "") => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    return [];
  }

  const [year, month] = monthKey.split("-").map(Number);
  return reports.filter((report) => {
    const parsed = parseReportDate(report.date);
    return (
      parsed &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1
    );
  });
};

export const normalizeRawReportEntry = (report = {}) => {
  const branch = getBranchLabel(report);
  const serviceType = getServiceLabel(report);
  const attendance = report.attendance || {};
  const men = normalizeNumber(attendance.men);
  const women = normalizeNumber(attendance.women);
  const children = normalizeNumber(attendance.children);
  const newVisitors = normalizeNumber(report.newVisitors ?? attendance.newVisitors);
  const incomeItems = (report.financials?.income || []).map(normalizeIncomeItem);
  const expenseItems = (report.financials?.expenses || []).map((row) =>
    normalizeEmbeddedExpenseItem(row, branch)
  );
  const isSpecialProgramme = Boolean(
    report.isSpecialProgramme ||
      report.specialProgramme?.enabled ||
      ["Special Programme", "Outreach", "Gospel Campaign", "Retreat", "Conference"].includes(
        serviceType
      ) ||
      report.serviceType === "Other Programme"
  );

  return {
    reportId: normalizeText(report.id) || normalizeText(report.reportKey),
    reportKey: normalizeText(report.reportKey) || normalizeText(report.id),
    date: normalizeText(report.date),
    dayOfWeek: normalizeText(report.dayOfWeek) || getDayOfWeek(report.date),
    branch,
    serviceType,
    isSpecialProgramme,
    specialProgramme: {
      enabled: isSpecialProgramme,
      name:
        normalizeText(report.specialProgramme?.name) ||
        normalizeText(report.specialProgrammeName) ||
        (isSpecialProgramme ? serviceType : ""),
      type:
        normalizeText(report.specialProgramme?.type) ||
        normalizeText(report.programmeType) ||
        (isSpecialProgramme ? serviceType : ""),
      highlights:
        normalizeText(report.specialProgramme?.highlights) ||
        normalizeText(report.remarks) ||
        normalizeText(report.notes)
    },
    attendance: {
      men,
      women,
      children,
      newVisitors,
      total: men + women + children
    },
    financials: {
      incomeItems,
      expenseItems,
      totalIncome: incomeItems.reduce((sum, item) => sum + item.amount, 0),
      totalExpense: expenseItems.reduce((sum, item) => sum + item.amount, 0)
    },
    notes: normalizeText(report.notes),
    createdAt: normalizeText(report.createdAt),
    createdBy: normalizeText(report.createdBy),
    lastModifiedAt: normalizeText(report.lastModifiedAt)
  };
};

const sortByDateThenText = (items = [], getDate, getText) =>
  [...items].sort((left, right) => {
    const leftDate = parseReportDate(getDate(left))?.getTime() || 0;
    const rightDate = parseReportDate(getDate(right))?.getTime() || 0;
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return String(getText(left) || "").localeCompare(String(getText(right) || ""));
  });

export const compileMonthlyReportData = ({
  reports = [],
  month,
  country = "",
  countryKey = "",
  monthlyExpenses = [],
  balanceBroughtForward = 0,
  summaryDocId = ""
}) => {
  const monthLabel = formatMonthLabel(month);
  const monthEntries = filterReportsForMonth(reports, month).map(normalizeRawReportEntry);
  const sortedEntries = sortByDateThenText(monthEntries, (entry) => entry.date, (entry) => {
    return `${entry.branch} ${entry.serviceType}`;
  });

  const branchMap = new Map();
  const serviceTypeCounts = new Map();
  const highlights = [];
  const incomeRegister = [];

  let totalMen = 0;
  let totalWomen = 0;
  let totalChildren = 0;
  let totalNewVisitors = 0;
  let totalIncome = 0;

  for (const entry of sortedEntries) {
    totalMen += entry.attendance.men;
    totalWomen += entry.attendance.women;
    totalChildren += entry.attendance.children;
    totalNewVisitors += entry.attendance.newVisitors;
    totalIncome += entry.financials.totalIncome;
    serviceTypeCounts.set(
      entry.serviceType,
      (serviceTypeCounts.get(entry.serviceType) || 0) + 1
    );

    if (!branchMap.has(entry.branch)) {
      branchMap.set(entry.branch, {
        branch: entry.branch,
        serviceCount: 0,
        attendance: {
          men: 0,
          women: 0,
          children: 0,
          total: 0
        },
        newVisitors: 0,
        totalIncome: 0,
        totalExpenseFromReports: 0,
        serviceBreakdown: new Map(),
        specialProgrammes: [],
        entries: []
      });
    }

    const branchGroup = branchMap.get(entry.branch);
    branchGroup.serviceCount += 1;
    branchGroup.attendance.men += entry.attendance.men;
    branchGroup.attendance.women += entry.attendance.women;
    branchGroup.attendance.children += entry.attendance.children;
    branchGroup.attendance.total += entry.attendance.total;
    branchGroup.newVisitors += entry.attendance.newVisitors;
    branchGroup.totalIncome += entry.financials.totalIncome;
    branchGroup.totalExpenseFromReports += entry.financials.totalExpense;
    branchGroup.entries.push(entry);

    const serviceMetrics = branchGroup.serviceBreakdown.get(entry.serviceType) || {
      serviceType: entry.serviceType,
      count: 0,
      totalAttendance: 0,
      minAttendance: 0,
      maxAttendance: 0,
      averageAttendance: 0
    };
    serviceMetrics.count += 1;
    serviceMetrics.totalAttendance += entry.attendance.total;
    serviceMetrics.minAttendance =
      serviceMetrics.count === 1
        ? entry.attendance.total
        : Math.min(serviceMetrics.minAttendance, entry.attendance.total);
    serviceMetrics.maxAttendance = Math.max(
      serviceMetrics.maxAttendance,
      entry.attendance.total
    );
    serviceMetrics.averageAttendance = serviceMetrics.count
      ? serviceMetrics.totalAttendance / serviceMetrics.count
      : 0;
    branchGroup.serviceBreakdown.set(entry.serviceType, serviceMetrics);

    if (entry.isSpecialProgramme) {
      branchGroup.specialProgrammes.push({
        date: entry.date,
        dayOfWeek: entry.dayOfWeek,
        title: entry.specialProgramme.name || entry.serviceType,
        type: entry.specialProgramme.type || entry.serviceType,
        attendance: entry.attendance,
        totalIncome: entry.financials.totalIncome,
        remarks: entry.specialProgramme.highlights || entry.notes
      });
    }

    for (const item of entry.financials.incomeItems) {
      incomeRegister.push({
        reportId: entry.reportId,
        date: entry.date,
        branch: entry.branch,
        serviceType: entry.serviceType,
        label: item.label,
        purpose: item.purpose,
        amount: item.amount
      });
    }

    if (entry.notes) {
      highlights.push({
        reportId: entry.reportId,
        date: entry.date,
        branch: entry.branch,
        serviceType: entry.serviceType,
        note: entry.notes
      });
    }
  }

  const normalizedMonthlyExpenses = sortByDateThenText(
    monthlyExpenses.map(normalizeMonthlyExpenseEntry).filter((row) => row.amount > 0 || row.details || row.purpose),
    (entry) => entry.date,
    (entry) => `${entry.purpose} ${entry.details}`
  );

  const fallbackExpenseRegister = sortedEntries.flatMap((entry) =>
    entry.financials.expenseItems
      .filter((item) => item.amount > 0)
      .map((item, index) => ({
        id: `${entry.reportId || entry.reportKey || "report"}-expense-${index + 1}`,
        date: entry.date,
        purpose: item.purpose || item.label || "Expense",
        details: [item.label, item.location, item.details].filter(Boolean).join(" | "),
        amount: item.amount,
        reportId: entry.reportId
      }))
  );

  const useMonthlyExpenseRegister = normalizedMonthlyExpenses.length > 0;
  const expenseRegister = useMonthlyExpenseRegister
    ? normalizedMonthlyExpenses
    : fallbackExpenseRegister;

  const totalExpense = expenseRegister.reduce((sum, item) => sum + item.amount, 0);
  const netMovement = totalIncome - totalExpense;
  const closingBalance = normalizeNumber(balanceBroughtForward) + netMovement;

  const branchReports = Array.from(branchMap.values())
    .map((branchGroup) => ({
      branch: branchGroup.branch,
      serviceCount: branchGroup.serviceCount,
      attendance: branchGroup.attendance,
      newVisitors: branchGroup.newVisitors,
      totalIncome: branchGroup.totalIncome,
      totalExpenseFromReports: branchGroup.totalExpenseFromReports,
      serviceBreakdown: Array.from(branchGroup.serviceBreakdown.values()).sort((left, right) =>
        left.serviceType.localeCompare(right.serviceType)
      ),
      specialProgrammes: branchGroup.specialProgrammes,
      entries: branchGroup.entries
    }))
    .sort((left, right) => left.branch.localeCompare(right.branch));

  const countryServiceStats = new Map();
  for (const entry of sortedEntries) {
    const stat = countryServiceStats.get(entry.serviceType) || {
      serviceType: entry.serviceType,
      count: 0,
      totalAttendance: 0,
      minAttendance: 0,
      maxAttendance: 0,
      averageAttendance: 0
    };
    stat.count += 1;
    stat.totalAttendance += entry.attendance.total;
    stat.minAttendance =
      stat.count === 1 ? entry.attendance.total : Math.min(stat.minAttendance, entry.attendance.total);
    stat.maxAttendance = Math.max(stat.maxAttendance, entry.attendance.total);
    stat.averageAttendance = stat.count ? stat.totalAttendance / stat.count : 0;
    countryServiceStats.set(entry.serviceType, stat);
  }

  const compilation = {
    meta: {
      month,
      monthLabel,
      country: normalizeText(country),
      countryKey: normalizeCountryKey(countryKey),
      sourceReportCount: sortedEntries.length,
      branchCount: branchReports.length,
      serviceCount: sortedEntries.length
    },
    attendanceTotals: {
      men: totalMen,
      women: totalWomen,
      children: totalChildren,
      newVisitors: totalNewVisitors,
      total: totalMen + totalWomen + totalChildren
    },
    serviceTypeCounts: Array.from(serviceTypeCounts.entries())
      .map(([serviceType, count]) => ({ serviceType, count }))
      .sort((left, right) => left.serviceType.localeCompare(right.serviceType)),
    countryServiceStats: Array.from(countryServiceStats.values()).sort((left, right) =>
      left.serviceType.localeCompare(right.serviceType)
    ),
    specialProgrammes: branchReports.flatMap((branch) =>
      (branch.specialProgrammes || []).map((programme) => ({
        ...programme,
        branch: branch.branch
      }))
    ),
    branchReports,
    sourceHighlights: highlights,
    financialData: {
      hasFinancialData:
        totalIncome > 0 ||
        totalExpense > 0 ||
        normalizeNumber(balanceBroughtForward) !== 0,
      balanceBroughtForward: normalizeNumber(balanceBroughtForward),
      totalIncome,
      totalExpense,
      netMovement,
      closingBalance,
      expenseSource: useMonthlyExpenseRegister
        ? "monthly_expense_records"
        : "embedded_report_expenses",
      incomeRegister,
      expenseRegister
    },
    traceability: {
      reportIds: sortedEntries.map((entry) => entry.reportId).filter(Boolean),
      monthlyExpenseIds: normalizedMonthlyExpenses.map((entry) => entry.id).filter(Boolean),
      summaryDocId: normalizeText(summaryDocId)
    }
  };

  return {
    rawEntries: sortedEntries,
    structuredCompilation: compilation
  };
};

export const buildCompiledReportText = ({ rawEntries = [], structuredCompilation = {} }) => {
  const meta = structuredCompilation.meta || {};
  const attendanceTotals = structuredCompilation.attendanceTotals || {};
  const financialData = structuredCompilation.financialData || {};
  const lines = [
    `Compiled Monthly Source Data`,
    ``,
    `Month: ${meta.monthLabel || meta.month || "-"}`,
    `Country: ${meta.country || "-"}`,
    `Source report count: ${meta.sourceReportCount || 0}`,
    `Branch count: ${meta.branchCount || 0}`,
    `Service count: ${meta.serviceCount || 0}`,
    ``,
    `Attendance Totals`,
    `- Men: ${attendanceTotals.men || 0}`,
    `- Women: ${attendanceTotals.women || 0}`,
    `- Children: ${attendanceTotals.children || 0}`,
    `- New Visitors: ${attendanceTotals.newVisitors || 0}`,
    `- Total: ${attendanceTotals.total || 0}`,
    ``
  ];

  const serviceTypeCounts = structuredCompilation.serviceTypeCounts || [];
  if (serviceTypeCounts.length > 0) {
    lines.push(`Service Type Counts`);
    for (const row of serviceTypeCounts) {
      lines.push(`- ${row.serviceType}: ${row.count}`);
    }
    lines.push(``);
  }

  const branchReports = structuredCompilation.branchReports || [];
  if (branchReports.length > 0) {
    lines.push(`Branch Reports`);
    for (const branch of branchReports) {
      lines.push(`- ${branch.branch}`);
      lines.push(`  Services: ${branch.serviceCount}`);
      lines.push(
        `  Attendance: Men ${branch.attendance?.men || 0}, Women ${branch.attendance?.women || 0}, Children ${branch.attendance?.children || 0}, New Visitors ${branch.newVisitors || 0}, Total ${branch.attendance?.total || 0}`
      );
      lines.push(`  Total Income (XCD): ${normalizeNumber(branch.totalIncome).toFixed(2)}`);
      lines.push(
        `  Total Expense From Reports (XCD): ${normalizeNumber(branch.totalExpenseFromReports).toFixed(2)}`
      );
      for (const service of branch.serviceBreakdown || []) {
        lines.push(
          `  - ${service.serviceType}: ${service.count} service(s), average attendance ${normalizeNumber(service.averageAttendance).toFixed(1)}, min ${service.minAttendance || 0}, max ${service.maxAttendance || 0}, cumulative attendance ${service.totalAttendance}`
        );
      }
      if ((branch.specialProgrammes || []).length > 0) {
        lines.push(`  Special programmes:`);
        for (const programme of branch.specialProgrammes) {
          lines.push(
            `  - ${programme.date || "-"} | ${programme.title || programme.type || "-"} | Attendance ${programme.attendance?.total || 0} | Visitors ${programme.attendance?.newVisitors || 0}${programme.remarks ? ` | ${programme.remarks}` : ""}`
          );
        }
      }
    }
    lines.push(``);
  }

  const countryServiceStats = structuredCompilation.countryServiceStats || [];
  if (countryServiceStats.length > 0) {
    lines.push(`Country-wide Service Type Statistics`);
    for (const service of countryServiceStats) {
      lines.push(
        `- ${service.serviceType}: ${service.count} service(s), average ${normalizeNumber(service.averageAttendance).toFixed(1)}, min ${service.minAttendance || 0}, max ${service.maxAttendance || 0}`
      );
    }
    lines.push(``);
  }

  if (financialData.hasFinancialData) {
    lines.push(`Financial Data`);
    lines.push(
      `- Balance Brought Forward (XCD): ${normalizeNumber(financialData.balanceBroughtForward).toFixed(2)}`
    );
    lines.push(`- Total Income (XCD): ${normalizeNumber(financialData.totalIncome).toFixed(2)}`);
    lines.push(`- Total Expense (XCD): ${normalizeNumber(financialData.totalExpense).toFixed(2)}`);
    lines.push(`- Net Movement (XCD): ${normalizeNumber(financialData.netMovement).toFixed(2)}`);
    lines.push(
      `- Closing Balance (XCD): ${normalizeNumber(financialData.closingBalance).toFixed(2)}`
    );
    lines.push(`- Expense Source: ${financialData.expenseSource || "-"}`);
    lines.push(``);
  }

  const highlights = structuredCompilation.sourceHighlights || [];
  if (highlights.length > 0) {
    lines.push(`Submitted Notes / Highlights`);
    for (const highlight of highlights) {
      lines.push(
        `- ${highlight.date || "-"} | ${highlight.branch || "-"} | ${highlight.serviceType || "-"}: ${highlight.note}`
      );
    }
    lines.push(``);
  }

  lines.push(`Source Entries`);
  if (rawEntries.length === 0) {
    lines.push(`- No source report entries were found for this month.`);
  } else {
    for (const entry of rawEntries) {
      lines.push(
        `- ${entry.date || "-"} | ${entry.branch || "-"} | ${entry.serviceType || "-"} | Attendance ${entry.attendance?.total || 0} (Men ${entry.attendance?.men || 0}, Women ${entry.attendance?.women || 0}, Children ${entry.attendance?.children || 0}) | Income XCD ${normalizeNumber(entry.financials?.totalIncome).toFixed(2)} | Expense XCD ${normalizeNumber(entry.financials?.totalExpense).toFixed(2)}`
      );
      if (entry.attendance?.newVisitors) {
        lines.push(`  New visitors: ${entry.attendance.newVisitors}`);
      }
      if (entry.isSpecialProgramme) {
        lines.push(
          `  Special programme: ${entry.specialProgramme?.name || entry.serviceType} (${entry.specialProgramme?.type || "Programme"})`
        );
      }
      if (entry.notes) {
        lines.push(`  Notes: ${entry.notes}`);
      }
      if ((entry.financials?.incomeItems || []).length > 0) {
        lines.push(`  Income items:`);
        for (const income of entry.financials.incomeItems) {
          lines.push(`  - ${income.label}: XCD ${normalizeNumber(income.amount).toFixed(2)}`);
        }
      }
      if ((entry.financials?.expenseItems || []).length > 0) {
        lines.push(`  Expense items:`);
        for (const expense of entry.financials.expenseItems) {
          const parts = [expense.label, expense.purpose, expense.location, expense.details].filter(
            Boolean
          );
          lines.push(`  - ${parts.join(" | ")}: XCD ${normalizeNumber(expense.amount).toFixed(2)}`);
        }
      }
    }
  }

  return lines.join("\n");
};
