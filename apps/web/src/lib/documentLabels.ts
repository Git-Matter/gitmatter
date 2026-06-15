export function fileTypeLabel(fileType: string): string {
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("word") || fileType.includes("docx") || fileType.includes("doc")) {
    return "DOCX";
  }
  if (fileType.includes("markdown") || fileType.includes("md")) return "MD";
  return fileType.split("/").pop() ?? fileType;
}

export function documentSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    upload: "Uploaded",
    replace: "Replaced",
    edit: "Tracked edit",
    generated: "Generated",
  };
  return labels[source] ?? source;
}

export function hasExtensionChanged(oldName: string, newName: string): boolean {
  return extension(oldName) !== extension(newName);
}

function extension(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
}
