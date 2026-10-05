/**
 * CSV for norsk Excel: semikolon som skilletegn, UTF-8 med BOM, CRLF. Celler som starter med = + - @ (eller tab/CR)
 * får en apostrof foran, slik at innsendt tekst ikke kan kjøres som formel når filen åpnes i et regneark.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
