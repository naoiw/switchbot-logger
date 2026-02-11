/** 横軸の範囲オプション（表示するデータ件数は5分間隔を想定） */
export const TIME_RANGES = [
  { label: "1時間", count: 12 },
  { label: "12時間", count: 144 },
  { label: "1日", count: 288 },
  { label: "1週間", count: 2016 },
] as const;

export type TimeRangeKey = (typeof TIME_RANGES)[number]["label"];

/**
 * スプレッドシートのタイムスタンプ文字列を Date にパースする。
 * UNIX秒（数値文字列）・ISO・"YYYY/MM/DD" 形式に対応。パースできない場合は null。
 */
export function parseTimestamp(ts: string): Date | null {
  if (!ts || typeof ts !== "string") return null;
  const trimmed = ts.trim();
  if (!trimmed) return null;
  // UNIX秒（10桁）またはミリ秒（13桁）の数値文字列
  const num = Number(trimmed);
  if (Number.isFinite(num) && num >= 1e9 && num < 1e15) {
    const ms = num < 1e12 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO / スラッシュ形式などに対応
  let d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d;
  // "YYYY/MM/DD HH:MM" など
  d = new Date(trimmed.replace(/\//g, "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * タイムスタンプで昇順ソートし、最新の count 件だけに絞る。
 * タイムスタンプがパースできない行は除外する。
 */
export function filterRowsByCount<T extends { timestamp: string }>(
  rows: T[],
  count: number
): T[] {
  const withDate = rows
    .map((row) => ({ row, date: parseTimestamp(row.timestamp) }))
    .filter((x): x is { row: T; date: Date } => x.date != null);
  if (withDate.length === 0) return [];
  withDate.sort((a, b) => a.date.getTime() - b.date.getTime());
  return withDate.slice(-count).map((x) => x.row);
}
