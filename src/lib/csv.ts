// Small RFC 4180 CSV reader and writer. Safe to import from client and server code.

/**
 * Parses CSV text into rows of fields.
 * Handles quoted fields, doubled quotes ("") inside quotes, commas and line breaks inside quotes,
 * CRLF / LF / CR line endings, a UTF-8 byte-order mark and a missing final line break.
 * Throws an Error with the line number when a quoted field is never closed.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let line = 1;
  let quoted = false;
  let quoteStartLine = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      if (c === "\n") line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      quoteStartLine = line;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      endRow();
      line++;
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (quoted) throw new Error(`Line ${quoteStartLine}: a quoted value is never closed (missing ").`);
  if (field !== "" || row.length) endRow();
  // Drop completely empty lines (common at the end of spreadsheet exports).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Rows with a header: each row becomes { header: value }. Header names are trimmed and lower-cased. */
export function parseCsvObjects(input: string): { headers: string[]; rows: { line: number; values: Record<string, string> }[] } {
  const all = parseCsv(input);
  if (!all.length) return { headers: [], rows: [] };
  const headers = all[0].map((h) => h.trim().toLowerCase());
  const rows = all.slice(1).map((r, idx) => ({
    line: idx + 2,
    values: Object.fromEntries(headers.map((h, k) => [h, (r[k] ?? "").trim()])),
  }));
  return { headers, rows };
}

const needsQuotes = /[",\r\n]|^\s|\s$/;

/**
 * Builds CSV text (CRLF line endings, as RFC 4180 asks).
 * `safe` neutralises spreadsheet formulas (cells starting with = + - @) by prefixing an apostrophe:
 * use it for files that carry customer-typed text such as names and addresses.
 */
export function toCsv(rows: (string | number | boolean | null | undefined)[][], opts: { safe?: boolean } = {}): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          let s = v === null || v === undefined ? "" : String(v);
          if (opts.safe && typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
          return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n") + "\r\n";
}

/** Splits a "a|b|c" list cell; blanks are dropped. */
export const splitList = (s: string) =>
  s
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
