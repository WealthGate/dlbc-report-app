import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import {
  buildCompiledReportText,
  compileMonthlyReportData,
  normalizeCountryKey
} from "./reportCompilation.js";
import { generateEnrichedMonthlyReport } from "./openaiService.js";

initializeApp();
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10
});

const db = getFirestore();
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const GENERATION_COOLDOWN_MS = 30 * 1000;
const GENERATION_LOCK_MS = 2 * 60 * 1000;

const normalizeRole = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const canGenerateMonthlyReport = (role = "") => {
  const normalized = normalizeRole(role);
  return (
    normalized === "admin" ||
    normalized === "vetting_committee_chairman" ||
    normalized === "vetting_committee_chair" ||
    normalized === "committee_chairman" ||
    normalized === "finance_reporter" ||
    normalized === "financial_secretary" ||
    normalized === "finance_secretary" ||
    normalized === "accountant"
  );
};

const validateMonth = (value) => {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid month in YYYY-MM format is required."
    );
  }
  return value;
};

const buildClientReportPayload = (docId, data = {}) => ({
  id: docId,
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
  errorMessage: data.lastError?.message || ""
});

const loadUserContext = async (uid) => {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "Your user profile could not be found.");
  }

  const profile = userSnap.data() || {};
  if (!canGenerateMonthlyReport(profile.role)) {
    throw new HttpsError(
      "permission-denied",
      "You do not have permission to generate official monthly reports."
    );
  }

  const countryKey = normalizeCountryKey(profile.countryKey || profile.country || "");
  if (!countryKey) {
    throw new HttpsError(
      "failed-precondition",
      "Your user profile is missing a country assignment."
    );
  }

  return {
    uid,
    email: profile.email || "",
    role: profile.role || "",
    country: profile.country || "",
    countryKey
  };
};

const fetchCountryReports = async ({ countryKey, country }) => {
  const reportCollection = db.collection("reports");
  const [primarySnap, legacySnap] = await Promise.all([
    reportCollection.where("countryKey", "==", countryKey).get(),
    country ? reportCollection.where("country", "==", country).get() : Promise.resolve({ docs: [] })
  ]);

  const merged = new Map();
  for (const snap of [...primarySnap.docs, ...(legacySnap.docs || [])]) {
    if (!merged.has(snap.id)) {
      merged.set(snap.id, {
        id: snap.id,
        ...snap.data()
      });
    }
  }

  return Array.from(merged.values());
};

const fetchMonthlyExpenses = async ({ countryKey, month }) => {
  const expenseSnap = await db
    .collection("monthly_expense_records")
    .where("countryKey", "==", countryKey)
    .where("month", "==", month)
    .get();

  return expenseSnap.docs.map((snap) => ({
    id: snap.id,
    ...snap.data()
  }));
};

const claimGenerationSlot = async ({
  reportRef,
  month,
  country,
  countryKey,
  generatedBy,
  generatedByUid
}) => {
  await db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(reportRef);
    const existing = existingSnap.exists ? existingSnap.data() || {} : null;
    const now = Date.now();
    const lastRequestedAt = existing?.lastRequestedAt
      ? new Date(existing.lastRequestedAt).getTime()
      : 0;

    if (
      existing?.status === "generating" &&
      now - lastRequestedAt < GENERATION_LOCK_MS
    ) {
      throw new HttpsError(
        "resource-exhausted",
        "A monthly report is already being generated for this month. Please wait and try again."
      );
    }

    if (
      lastRequestedAt &&
      now - lastRequestedAt < GENERATION_COOLDOWN_MS &&
      existing?.generatedByUid === generatedByUid
    ) {
      throw new HttpsError(
        "resource-exhausted",
        "Please wait a few seconds before requesting another generation."
      );
    }

    transaction.set(
      reportRef,
      {
        month,
        country,
        countryKey,
        status: "generating",
        generatedBy,
        generatedByUid,
        lastRequestedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
      },
      { merge: true }
    );
  });
};

export const generateMonthlyAiReport = onCall(
  {
    timeoutSeconds: 120,
    memory: "1GiB",
    secrets: [OPENAI_API_KEY]
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate a report.");
    }

    const month = validateMonth(request.data?.month);
    const userContext = await loadUserContext(request.auth.uid);
    const docId = `${userContext.countryKey}__${month}`;
    const reportRef = db.doc(`monthly_ai_reports/${docId}`);

    await claimGenerationSlot({
      reportRef,
      month,
      country: userContext.country,
      countryKey: userContext.countryKey,
      generatedBy: userContext.email || request.auth.token.email || "",
      generatedByUid: userContext.uid
    });

    try {
      const [reports, monthlyExpenses, summarySnap] = await Promise.all([
        fetchCountryReports({
          countryKey: userContext.countryKey,
          country: userContext.country
        }),
        fetchMonthlyExpenses({
          countryKey: userContext.countryKey,
          month
        }),
        db.doc(`monthly_summaries/${docId}`).get()
      ]);

      const summaryData = summarySnap.exists ? summarySnap.data() || {} : {};
      const compiled = compileMonthlyReportData({
        reports,
        month,
        country: userContext.country,
        countryKey: userContext.countryKey,
        monthlyExpenses,
        balanceBroughtForward: Number(summaryData.balanceBroughtForward || 0),
        summaryDocId: summarySnap.exists ? summarySnap.id : ""
      });

      if ((compiled.rawEntries || []).length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "No submitted report entries were found for the selected month."
        );
      }

      const rawCompiledReportText = buildCompiledReportText(compiled);
      const aiResult = await generateEnrichedMonthlyReport({
        apiKey: OPENAI_API_KEY.value(),
        structuredCompilation: compiled.structuredCompilation,
        rawCompiledReportText
      });

      const now = new Date().toISOString();
      const reportData = {
        month,
        monthLabel: compiled.structuredCompilation.meta?.monthLabel || month,
        country: userContext.country,
        countryKey: userContext.countryKey,
        status: "ready",
        generatedAt: now,
        updatedAt: now,
        generatedBy: userContext.email || request.auth.token.email || "",
        generatedByUid: userContext.uid,
        sourceReportCount: compiled.rawEntries.length,
        rawEntries: compiled.rawEntries,
        rawCompiledReportText,
        structuredCompilation: compiled.structuredCompilation,
        enrichedReport: aiResult.enrichedReport,
        promptVersion: aiResult.promptVersion,
        model: aiResult.model,
        openaiResponseId: aiResult.responseId,
        lastError: FieldValue.delete(),
        generationCount: FieldValue.increment(1)
      };

      await reportRef.set(reportData, { merge: true });
      return {
        report: buildClientReportPayload(docId, {
          ...reportData,
          generationCount: undefined
        })
      };
    } catch (error) {
      const safeMessage =
        error instanceof HttpsError
          ? error.message
          : "The monthly report could not be generated at this time.";

      await reportRef.set(
        {
          month,
          country: userContext.country,
          countryKey: userContext.countryKey,
          status: "failed",
          updatedAt: new Date().toISOString(),
          generatedBy: userContext.email || request.auth.token.email || "",
          generatedByUid: userContext.uid,
          lastError: {
            message: safeMessage,
            at: new Date().toISOString()
          }
        },
        { merge: true }
      );

      logger.error("Monthly AI report generation failed", {
        month,
        countryKey: userContext.countryKey,
        userId: userContext.uid,
        message: safeMessage
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", safeMessage);
    }
  }
);
