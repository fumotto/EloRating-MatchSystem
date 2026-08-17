// 持ち出しデータの保存（Issue #9）。
//
// ★CSVで渡す。管理者は表計算ソフトで開く前提であり、JSONだと開けない人がいる。
//
// ★値のエスケープを自前で行う。区切り記号・引用符・改行を含む値をそのまま連結すると、
//   列がずれたまま気付かれずに保存される。

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }

  // ★CRLF で出す。Excel が既定で扱う改行である。
  return lines.join("\r\n");
}

export function downloadCsv(fileName: string, rows: Record<string, unknown>[]): void {
  // ★BOM を付ける。無いと Excel が UTF-8 と判定せず、チーム名が文字化けする。
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}
