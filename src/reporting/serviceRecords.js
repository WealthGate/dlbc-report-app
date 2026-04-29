export const DEFAULT_BRANCHES = [
  "Roseau",
  "Belfast",
  "Loubiere",
  "Portsmouth",
  "Marigot",
  "Grand Bay",
  "Goodwill",
  "Other"
];

export const STANDARD_SERVICE_TYPES = [
  "Sunday Worship Service",
  "Tuesday Bible Study",
  "Thursday Revival Service",
  "Special Programme",
  "Outreach",
  "Gospel Campaign",
  "Retreat",
  "Conference",
  "Other"
];

export const SPECIAL_PROGRAMME_TYPES = [
  "Gospel Campaign",
  "Prayer Conference",
  "Retreat",
  "Evangelism Outreach",
  "Conference",
  "Other"
];

export const COLLECTION_PURPOSES = [
  "Offering",
  "Tithe",
  "Special Contribution",
  "Church Project",
  "Outreach Support",
  "Thanksgiving",
  "Other"
];

export const BASE_CURRENCY = "XCD";
export const USD_TO_XCD_RATE = 2.67;

export const COLLECTION_CURRENCIES = [
  { code: "XCD", label: "Eastern Caribbean Dollar (XCD/EC)", rateToXcd: 1 },
  { code: "USD", label: "US Dollar (USD)", rateToXcd: USD_TO_XCD_RATE },
  { code: "EUR", label: "Euro (EUR)", rateToXcd: 1 },
  { code: "GBP", label: "British Pound (GBP)", rateToXcd: 1 },
  { code: "BBD", label: "Barbados Dollar (BBD)", rateToXcd: 1 },
  { code: "TTD", label: "Trinidad & Tobago Dollar (TTD)", rateToXcd: 1 },
  { code: "JMD", label: "Jamaican Dollar (JMD)", rateToXcd: 1 },
  { code: "GYD", label: "Guyanese Dollar (GYD)", rateToXcd: 1 },
  { code: "BSD", label: "Bahamian Dollar (BSD)", rateToXcd: 1 },
  { code: "BZD", label: "Belize Dollar (BZD)", rateToXcd: 1 }
];

export const getCurrencyOption = (currency = BASE_CURRENCY) =>
  COLLECTION_CURRENCIES.find((option) => option.code === currency) ||
  COLLECTION_CURRENCIES[0];

export const getDefaultExchangeRateToXcd = (currency = BASE_CURRENCY) =>
  getCurrencyOption(currency).rateToXcd;

export const CORE_SERVICE_TYPES = [
  "Sunday Worship Service",
  "Tuesday Bible Study",
  "Thursday Revival Service"
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

export const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseNonNegativeNumber = (value) => Math.max(0, parseNumber(value));

export const parseWholeNumber = (value) => Math.max(0, Math.floor(parseNumber(value)));

export const getDayOfWeek = (dateValue = "") => {
  if (!dateValue) return "";
  const parts = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return DAY_NAMES[date.getDay()] || "";
};

export const getBranchName = (record = {}) => {
  if (record.branch === "Other" && record.otherBranch) return record.otherBranch;
  if (record.branch === "Headquarters") return "Goodwill";
  return record.branch || "Unknown";
};

export const getServiceName = (record = {}) => {
  if (record.serviceType === "Other Programme") {
    return record.otherServiceType?.trim() || "Other Programme";
  }
  if (record.serviceType === "Other") {
    return record.otherServiceType?.trim() || "Other";
  }
  if (record.serviceType === "Special Programme") {
    return record.specialProgramme?.name?.trim() || "Special Programme";
  }
  return record.serviceType || "Service";
};

export const getAttendanceTotals = (record = {}) => {
  const attendance = record.attendance || {};
  const men = parseWholeNumber(attendance.men);
  const women = parseWholeNumber(attendance.women);
  const children = parseWholeNumber(attendance.children);
  const newVisitors = parseWholeNumber(record.newVisitors ?? attendance.newVisitors);
  return {
    men,
    women,
    children,
    newVisitors,
    total: men + women + children
  };
};

export const getIncomeRowAmountXcd = (row = {}) => {
  const amount = parseNonNegativeNumber(row.amount);
  const currency = row.currency || BASE_CURRENCY;
  const fallbackRate = getDefaultExchangeRateToXcd(currency);
  const rate = parseNonNegativeNumber(row.exchangeRateToXcd ?? row.exchangeRate ?? fallbackRate);
  if (row.currency || row.exchangeRateToXcd != null || row.exchangeRate != null) {
    return amount * (rate || fallbackRate || 1);
  }
  if (row.amountXcd != null) return parseNonNegativeNumber(row.amountXcd);
  return amount * (rate || fallbackRate || 1);
};

export const getIncomeTotal = (record = {}) =>
  (record.financials?.income || []).reduce((sum, row) => sum + getIncomeRowAmountXcd(row), 0);

export const getIncomePurpose = (row = {}) =>
  row.purpose === "Other"
    ? row.otherPurpose?.trim() || row.label?.trim() || "Other"
    : row.purpose || row.label || "Offering";

export const isSpecialProgrammeRecord = (record = {}) =>
  Boolean(
    record.isSpecialProgramme ||
      record.specialProgramme?.enabled ||
      ["Special Programme", "Outreach", "Gospel Campaign", "Retreat", "Conference"].includes(
        record.serviceType
      ) ||
      record.serviceType === "Other Programme"
  );

export const normalizeServiceRecord = (record = {}) => {
  const attendance = getAttendanceTotals(record);
  const branch = getBranchName(record);
  const serviceType = getServiceName(record);
  const dayOfWeek = record.dayOfWeek || getDayOfWeek(record.date);
  const specialProgramme = {
    enabled: isSpecialProgrammeRecord(record),
    name:
      record.specialProgramme?.name ||
      record.specialProgrammeName ||
      (record.serviceType === "Special Programme" || record.serviceType === "Other Programme"
        ? record.otherServiceType
        : ""),
    type:
      record.specialProgramme?.type ||
      record.programmeType ||
      (isSpecialProgrammeRecord(record) ? record.serviceType : ""),
    highlights:
      record.specialProgramme?.highlights ||
      record.remarks ||
      record.notes ||
      ""
  };

  return {
    ...record,
    branch,
    serviceType,
    dayOfWeek,
    attendance,
    newVisitors: attendance.newVisitors,
    totalAttendance: attendance.total,
    totalIncome: getIncomeTotal(record),
    isSpecialProgramme: specialProgramme.enabled,
    specialProgramme
  };
};

export const validateServiceRecord = ({
  date,
  branch,
  otherBranch,
  serviceType,
  otherServiceType,
  attendance = {},
  newVisitors,
  incomeRows = [],
  isSpecialProgramme,
  specialProgrammeName
}) => {
  if (!date) return "Please select the service date.";
  if (!branch) return "Please select the branch.";
  if (branch === "Other" && !String(otherBranch || "").trim()) {
    return "Please enter the branch name.";
  }
  if (!serviceType) return "Please select the service type.";
  if (serviceType === "Other" && !String(otherServiceType || "").trim()) {
    return "Please enter the custom service label.";
  }
  if (isSpecialProgramme && !String(specialProgrammeName || "").trim()) {
    return "Please enter the special programme name.";
  }

  const numberFields = [
    ["Men", attendance.men],
    ["Women", attendance.women],
    ["Children", attendance.children],
    ["New visitors", newVisitors],
    ...incomeRows.map((row, index) => [`Income row ${index + 1}`, row.amount])
  ];
  const hasNegative = numberFields.some(([, value]) => Number(value) < 0);
  if (hasNegative) return "Attendance and finance values cannot be negative.";

  return "";
};

const createMetricBucket = (serviceType) => ({
  serviceType,
  count: 0,
  totalAttendance: 0,
  averageAttendance: 0,
  minAttendance: 0,
  maxAttendance: 0
});

const addToMetricBucket = (bucket, attendanceTotal) => {
  bucket.count += 1;
  bucket.totalAttendance += attendanceTotal;
  bucket.minAttendance =
    bucket.count === 1 ? attendanceTotal : Math.min(bucket.minAttendance, attendanceTotal);
  bucket.maxAttendance = Math.max(bucket.maxAttendance, attendanceTotal);
  bucket.averageAttendance = bucket.count ? bucket.totalAttendance / bucket.count : 0;
};

export const buildMonthlyServiceSummary = (records = []) => {
  const normalized = records.map(normalizeServiceRecord);
  const branchMap = new Map();
  const countryServiceMap = new Map();
  const incomeByBranch = new Map();
  const incomeByServiceType = new Map();
  const incomeByPurpose = new Map();
  const specialProgrammes = [];

  const totals = {
    serviceCount: normalized.length,
    men: 0,
    women: 0,
    children: 0,
    newVisitors: 0,
    attendance: 0,
    income: 0
  };

  normalized.forEach((record) => {
    totals.men += record.attendance.men;
    totals.women += record.attendance.women;
    totals.children += record.attendance.children;
    totals.newVisitors += record.newVisitors;
    totals.attendance += record.totalAttendance;
    totals.income += record.totalIncome;

    if (!branchMap.has(record.branch)) {
      branchMap.set(record.branch, {
        branch: record.branch,
        serviceCount: 0,
        attendance: { men: 0, women: 0, children: 0, total: 0 },
        newVisitors: 0,
        totalIncome: 0,
        serviceTypes: new Map(),
        specialProgrammes: []
      });
    }

    const branch = branchMap.get(record.branch);
    branch.serviceCount += 1;
    branch.attendance.men += record.attendance.men;
    branch.attendance.women += record.attendance.women;
    branch.attendance.children += record.attendance.children;
    branch.attendance.total += record.totalAttendance;
    branch.newVisitors += record.newVisitors;
    branch.totalIncome += record.totalIncome;

    if (!branch.serviceTypes.has(record.serviceType)) {
      branch.serviceTypes.set(record.serviceType, createMetricBucket(record.serviceType));
    }
    addToMetricBucket(branch.serviceTypes.get(record.serviceType), record.totalAttendance);

    if (!countryServiceMap.has(record.serviceType)) {
      countryServiceMap.set(record.serviceType, createMetricBucket(record.serviceType));
    }
    addToMetricBucket(countryServiceMap.get(record.serviceType), record.totalAttendance);

    incomeByBranch.set(record.branch, (incomeByBranch.get(record.branch) || 0) + record.totalIncome);
    incomeByServiceType.set(
      record.serviceType,
      (incomeByServiceType.get(record.serviceType) || 0) + record.totalIncome
    );

    (record.financials?.income || []).forEach((row) => {
      const amount = getIncomeRowAmountXcd(row);
      if (!amount) return;
      const purpose = getIncomePurpose(row);
      incomeByPurpose.set(purpose, (incomeByPurpose.get(purpose) || 0) + amount);
    });

    if (record.isSpecialProgramme) {
      const programme = {
        date: record.date,
        dayOfWeek: record.dayOfWeek,
        location: record.branch,
        title: record.specialProgramme.name || record.serviceType,
        type: record.specialProgramme.type || record.serviceType,
        attendance: record.attendance,
        newVisitors: record.newVisitors,
        totalIncome: record.totalIncome,
        remarks: record.specialProgramme.highlights || record.notes || ""
      };
      specialProgrammes.push(programme);
      branch.specialProgrammes.push(programme);
    }
  });

  const mapToRows = (map) =>
    Array.from(map.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return {
    totals,
    branches: Array.from(branchMap.values())
      .map((branch) => ({
        ...branch,
        serviceTypes: Array.from(branch.serviceTypes.values()).sort((a, b) =>
          a.serviceType.localeCompare(b.serviceType)
        )
      }))
      .sort((a, b) => a.branch.localeCompare(b.branch)),
    countryServiceTypes: Array.from(countryServiceMap.values()).sort((a, b) =>
      a.serviceType.localeCompare(b.serviceType)
    ),
    coreServiceTypes: CORE_SERVICE_TYPES.map((serviceType) => ({
      serviceType,
      ...(countryServiceMap.get(serviceType) || createMetricBucket(serviceType))
    })),
    incomeByBranch: mapToRows(incomeByBranch),
    incomeByServiceType: mapToRows(incomeByServiceType),
    incomeByPurpose: mapToRows(incomeByPurpose),
    specialProgrammes
  };
};

export const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildServiceRecordsCsv = (records = []) => {
  const headers = [
    "Date",
    "Day",
    "Branch",
    "Service Type",
    "Special Programme",
    "Programme Type",
    "Men",
    "Women",
    "Children",
    "New Visitors",
    "Total Attendance",
    "Income Total",
    "Income Purposes",
    "Notes"
  ];
  const rows = records.map((record) => {
    const normalized = normalizeServiceRecord(record);
    const incomePurposes = (record.financials?.income || [])
      .filter((row) => parseNonNegativeNumber(row.amount) > 0 || row.label || row.purpose)
      .map((row) => `${getIncomePurpose(row)}: ${getIncomeRowAmountXcd(row).toFixed(2)}`)
      .join("; ");
    return [
      normalized.date,
      normalized.dayOfWeek,
      normalized.branch,
      normalized.serviceType,
      normalized.isSpecialProgramme ? normalized.specialProgramme.name || "Yes" : "",
      normalized.isSpecialProgramme ? normalized.specialProgramme.type || "" : "",
      normalized.attendance.men,
      normalized.attendance.women,
      normalized.attendance.children,
      normalized.newVisitors,
      normalized.totalAttendance,
      normalized.totalIncome.toFixed(2),
      incomePurposes,
      normalized.notes || ""
    ];
  });
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
};

export const downloadCsv = (filename, csvText) => {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
