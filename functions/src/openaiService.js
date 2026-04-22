import OpenAI from "openai";
import { buildMonthlyChurchReportPrompt, MONTHLY_REPORT_PROMPT_VERSION } from "./reportPrompt.js";

const DEFAULT_REPORT_MODEL = "gpt-5-mini";

const extractOutputText = (response) => {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const messageTexts = [];
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        messageTexts.push(content.text);
      }
    }
  }

  return messageTexts.join("\n").trim();
};

export const generateEnrichedMonthlyReport = async ({
  apiKey,
  structuredCompilation,
  rawCompiledReportText
}) => {
  const client = new OpenAI({ apiKey });
  const prompt = buildMonthlyChurchReportPrompt({
    structuredCompilation,
    rawCompiledReportText
  });

  const response = await client.responses.create({
    model: DEFAULT_REPORT_MODEL,
    reasoning: { effort: "low" },
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: "You prepare factual, formal administrative reports. You never invent or alter facts."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt
          }
        ]
      }
    ],
    max_output_tokens: 2400
  });

  const enrichedReport = extractOutputText(response);
  if (!enrichedReport) {
    throw new Error("The OpenAI response did not include any report text.");
  }

  return {
    enrichedReport,
    model: DEFAULT_REPORT_MODEL,
    promptVersion: MONTHLY_REPORT_PROMPT_VERSION,
    responseId: response.id || ""
  };
};
