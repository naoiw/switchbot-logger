import type { LogRow } from "./sheetApi";
import { filterRowsByCount, parseTimestamp } from "./timeRange";

export type MetricKey = "temperature" | "humidity" | "discomfortIndex" | "co2";

export const METRICS: ReadonlyArray<{
  key: MetricKey;
  label: string;
  unit: string;
  tone: string;
  icon: string;
}> = [
  { key: "temperature", label: "温度", unit: "°C", tone: "temperature", icon: "🌡️" },
  { key: "humidity", label: "湿度", unit: "%", tone: "humidity", icon: "💧" },
  { key: "discomfortIndex", label: "不快指数", unit: "", tone: "comfort", icon: "🌤️" },
  { key: "co2", label: "CO₂濃度", unit: "ppm", tone: "co2", icon: "🍃" },
];

export function getLatestRow(rows: LogRow[]): LogRow | null {
  let latest: LogRow | null = null;
  let latestTime = -Infinity;
  for (const row of rows) {
    const time = parseTimestamp(row.timestamp)?.getTime();
    if (time !== undefined && time > latestTime) {
      latest = row;
      latestTime = time;
    }
  }
  return latest;
}

export function getTemperatureStats(rows: LogRow[]): { min: number | null; max: number | null } {
  // 5分間隔の計測を前提にした直近288件（約24時間）。
  const temperatures = filterRowsByCount(rows, 288)
    .map((row) => row.temperature)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (temperatures.length === 0) return { min: null, max: null };
  return { min: Math.min(...temperatures), max: Math.max(...temperatures) };
}

export function formatMetric(value: number | null, unit = ""): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const precision = unit === "ppm" ? 0 : 1;
  return value.toFixed(precision);
}

export function getStatusLabel(key: MetricKey, value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (key === "co2") {
    if (value <= 600) return "良好";
    if (value <= 800) return "通常";
    if (value <= 1000) return "換気の目安";
    return "換気を推奨";
  }
  if (key === "discomfortIndex") {
    if (value <= 55) return "寒い";
    if (value < 60) return "肌寒い";
    if (value < 65) return "やや涼しい";
    if (value < 70) return "快適";
    if (value < 75) return "ほぼ快適";
    if (value < 80) return "やや暑い";
    if (value < 85) return "暑い";
    return "非常に暑い";
  }
  return null;
}
