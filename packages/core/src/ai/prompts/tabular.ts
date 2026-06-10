function formatSuffix(format?: string): string {
  switch (format) {
    case "number":
    case "percentage":
    case "monetary_amount":
    case "currency":
      return " Respond with the numeric value only.";
    case "date":
      return " Respond with the date only.";
    case "yes_no":
      return " Respond with Yes or No.";
    case "bulleted_list":
      return " Respond as a markdown bulleted list.";
    default:
      return "";
  }
}

export const EXTRACTION_SYSTEM = `You are a legal document analyst. Return ONLY valid JSON:
{"summary": string, "flag": "green"|"grey"|"yellow"|"red", "reasoning": string}
The "summary" holds the extracted value (markdown allowed, escape newlines as \\n). All explanation goes in "reasoning".
Flags: green = standard/favorable, yellow = needs attention, red = problematic/unfavorable, grey = neutral/not found.`;

/** Build the system + user messages for a single tabular cell extraction. */
export function buildCellPrompt(params: {
  filename: string;
  documentText: string;
  columnPrompt: string;
  format?: string;
}): { system: string; user: string } {
  const instruction = `${params.columnPrompt}${formatSuffix(params.format)} If not found, state "Not Found". Put all reasoning in the "reasoning" field only.`;
  return {
    system: EXTRACTION_SYSTEM,
    user: `Document: ${params.filename}\n\n${params.documentText.slice(0, 120_000)}\n\n---\nInstruction: ${instruction}`,
  };
}
