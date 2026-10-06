export function quoteCsv(value: unknown) {
  let text = String(value ?? "");
  // Spreadsheet applications may execute formulas even in quoted cells.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
