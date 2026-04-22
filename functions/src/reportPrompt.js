export const MONTHLY_REPORT_PROMPT_VERSION = "church-monthly-report-v1";

const REQUIRED_HEADINGS = [
  "Title",
  "Introduction",
  "Summary of Activities",
  "Branch / Department Reports",
  "Major Outcomes",
  "Challenges Encountered",
  "Financial Notes",
  "Recommendations",
  "Conclusion"
];

export const buildMonthlyChurchReportPrompt = ({
  structuredCompilation,
  rawCompiledReportText
}) => {
  const headingsText = REQUIRED_HEADINGS.join(", ");
  const compilationJson = JSON.stringify(structuredCompilation, null, 2);

  return [
    `You are assisting with the preparation of an official monthly church activities report.`,
    `Use only the information provided below.`,
    `Do not invent or assume any facts.`,
    `Do not alter numbers, names, attendance, finances, dates, testimonies, or events.`,
    `Do not add spiritual outcomes, testimonies, recommendations, challenges, or achievements unless they are supported by the provided data.`,
    `If some information is missing, state it neutrally rather than guessing.`,
    `Your role is to improve grammar, clarity, structure, tone, readability, flow, and professionalism only.`,
    `Use formal, respectful church administrative language.`,
    `Merge duplicate or overlapping entries carefully without losing facts.`,
    `If no specific challenge was reported, state that no specific challenge was explicitly reported.`,
    `If no recommendation can be grounded in the source data, provide cautious administrative recommendations based on the reported gaps only.`,
    `Output plain text only.`,
    `Use these section headings in this order: ${headingsText}.`,
    `Include the "Financial Notes" section only if financial data is present in the source data. If it is included, preserve every amount exactly.`,
    ``,
    `Structured monthly data (JSON):`,
    compilationJson,
    ``,
    `Readable compiled source data:`,
    rawCompiledReportText
  ].join("\n");
};
