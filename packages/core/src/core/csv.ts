export type CsvValue = string | number | Date | null | undefined;

export function csvCell(value: CsvValue): string {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "");
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function rowsToCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
