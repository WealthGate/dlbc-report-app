import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const FUNCTIONS_REGION = "us-central1";
const EMULATOR_HOST = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1";
const EMULATOR_PORT = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
const shouldUseFunctionsEmulator =
  String(import.meta.env.VITE_USE_FIREBASE_FUNCTIONS_EMULATOR || "").toLowerCase() === "true";
const initializedFunctionApps = new Set();

const getMonthlyAiFunctions = (firebaseApp) => {
  const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  if (shouldUseFunctionsEmulator && !initializedFunctionApps.has(firebaseApp.name)) {
    connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORT);
    initializedFunctionApps.add(firebaseApp.name);
  }
  return functions;
};

export const normalizeMonthlyAiReport = (id, data = {}) => ({
  id,
  month: data.month || "",
  monthLabel: data.monthLabel || "",
  country: data.country || "",
  countryKey: data.countryKey || "",
  status: data.status || "unknown",
  generatedAt: data.generatedAt || "",
  generatedBy: data.generatedBy || "",
  generatedByUid: data.generatedByUid || "",
  sourceReportCount: Number(data.sourceReportCount || 0),
  rawEntries: Array.isArray(data.rawEntries) ? data.rawEntries : [],
  rawCompiledReportText: data.rawCompiledReportText || "",
  structuredCompilation: data.structuredCompilation || null,
  enrichedReport: data.enrichedReport || "",
  promptVersion: data.promptVersion || "",
  model: data.model || "",
  errorMessage: data.errorMessage || data.lastError?.message || ""
});

export const requestMonthlyAiReportGeneration = async (firebaseApp, { month }) => {
  const functions = getMonthlyAiFunctions(firebaseApp);
  const generateMonthlyAiReport = httpsCallable(functions, "generateMonthlyAiReport");
  const response = await generateMonthlyAiReport({ month });
  return normalizeMonthlyAiReport(
    response?.data?.report?.id || "",
    response?.data?.report || {}
  );
};

export const formatMonthlyAiError = (error) => {
  const code = String(error?.code || "");
  switch (code) {
    case "functions/unauthenticated":
      return "You must be signed in to generate a monthly report.";
    case "functions/permission-denied":
      return "You do not have permission to generate the official monthly report.";
    case "functions/failed-precondition":
      return error?.message || "The selected month does not have enough data to generate a report.";
    case "functions/resource-exhausted":
      return error?.message || "A report was requested too recently. Please wait and try again.";
    case "functions/internal":
      return "The AI report service failed. Please try again in a moment.";
    default:
      return error?.message || "Unable to generate the monthly report.";
  }
};

export const copyTextToClipboard = async (text) => {
  const content = String(text || "");
  if (!content.trim()) return false;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return true;
  }

  const textArea = document.createElement("textarea");
  textArea.value = content;
  textArea.setAttribute("readonly", "readonly");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
  return true;
};

export const downloadTextFile = (filename, text) => {
  const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const buildMonthlyAiFilename = (countryKey, month, suffix = "monthly-report") => {
  const safeCountry = String(countryKey || "country")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const safeMonth = String(month || "month").trim().replace(/[^0-9-]+/g, "");
  return `${suffix}-${safeCountry || "country"}-${safeMonth || "month"}.txt`;
};
