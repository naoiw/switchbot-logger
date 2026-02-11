/** 横軸の範囲オプション（ミリ秒） */
export const TIME_RANGES = [
  { label: "1時間", ms: 60 * 60 * 1000 },
  { label: "12時間", ms: 12 * 60 * 60 * 1000 },
  { label: "1日", ms: 24 * 60 * 60 * 1000 },
  { label: "1週間", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type TimeRangeKey = (typeof TIME_RANGES)[number]["label"];

/**
 * スプレッドシートのタイムスタンプ文字列を Date にパースする。
 * パースできない場合は null。
 */
export function parseTimestamp(ts: string): Date | null {
  if (!ts || typeof ts !== "string") return null;
  const trimmed = ts.trim();
  if (!trimmed) return null;
  // ISO / スラッシュ形式などに対応
  let d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d;
  // "YYYY/MM/DD HH:MM" など
  d = new Date(trimmed.replace(/\//g, "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 指定範囲（現在時刻基準で過去 ms ミリ秒）に含まれる行だけに絞る。
 * タイムスタンプがパースできない行は除外する。
 */
export function filterRowsByRange<T extends { timestamp: string }>(
  rows: T[],
  rangeMs: number
): T[] {
  const withDate = rows
    .map((row) => ({ row, date: parseTimestamp(row.timestamp) }))
    .filter((x): x is { row: T; date: Date } => x.date != null);
  if (withDate.length === 0) return [];
  const maxDate = new Date(
    Math.max(...withDate.map((x) => x.date.getTime()))
  );
  const minTime = maxDate.getTime() - rangeMs;
  return withDate
    .filter((x) => x.date.getTime() >= minTime)
    .map((x) => x.row);
}
