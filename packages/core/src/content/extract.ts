import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as mammoth from "mammoth";

// mammoth ships markdown conversion at runtime but omits it from its type defs.
const convertToMarkdown = (
  mammoth as unknown as {
    convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  }
).convertToMarkdown;

// File-type helpers. Lawyers upload PDF + DOCX; we normalize to markdown for
// LLM context (tabular reviews, chat). DOCX is extracted in-process via mammoth;
// PDF is sent to the markitdown MCP sidecar (mammoth can't read PDF).

export type SupportedFileType = "pdf" | "docx" | "doc";

const MIME: Record<SupportedFileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export function fileTypeFromName(name: string): SupportedFileType | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf" || ext === "docx" || ext === "doc") return ext;
  return null;
}

/** Extract markdown from a document's bytes. */
export async function extractMarkdown(bytes: Buffer, fileType: SupportedFileType): Promise<string> {
  if (fileType === "docx" || fileType === "doc") {
    const { value } = await convertToMarkdown({ buffer: bytes });
    return value;
  }
  return extractPdfViaMarkitdown(bytes);
}

async function extractPdfViaMarkitdown(bytes: Buffer): Promise<string> {
  const url = process.env.MARKITDOWN_MCP_URL || "http://localhost:4281/mcp";
  const client = new Client({ name: "gitcounsel", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  try {
    const dataUri = `data:${MIME.pdf};base64,${bytes.toString("base64")}`;
    const res = await client.callTool({ name: "convert_to_markdown", arguments: { uri: dataUri } });
    const content = res.content as Array<{ type: string; text?: string }> | undefined;
    return (content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
  } finally {
    await client.close().catch(() => {});
  }
}
