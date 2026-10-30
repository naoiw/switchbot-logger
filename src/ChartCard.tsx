import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LogRow } from "./sheetApi";
import type { MetricKey } from "./metrics";
import { parseTimestamp } from "./timeRange";

const PADDING: Record<MetricKey, number> = {
  temperature: 1,
  humidity: 1,
  discomfortIndex: 2,
  co2: 5,
};

function paddedDomain(values: number[], padding: number): [number, number] {
  if (values.length === 0) return [0, 100];
  return [Math.min(...values) - padding, Math.max(...values) + padding];
}

function formatDate(raw: string, short = false): string {
  const date = parseTimestamp(raw);
  if (!date) return raw;
  return date.toLocaleString("ja-JP", short
    ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface ChartCardProps {
  title: string;
  unit: string;
  dataKey: MetricKey;
  data: LogRow[];
  color: string;
  tone: string;
}

export function ChartCard({ title, unit, dataKey, data, color, tone }: ChartCardProps) {
  const chartData = useMemo(() => data.map((row) => {
    const raw = row[dataKey];
    const numeric = raw == null || raw === "" ? null : Number(raw);
    return { ...row, [dataKey]: numeric != null && Number.isFinite(numeric) ? numeric : null };
  }), [data, dataKey]);

  const values = chartData
    .map((row) => row[dataKey])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const domain = paddedDomain(values, PADDING[dataKey]);

  return (
    <section className="chart-card" data-tone={tone} aria-label={title + "の推移"}>
      <div className="chart-card__header">
        <div>
          <p className="eyebrow">TREND</p>
          <h3>{title}<span className="chart-unit">{unit}</span></h3>
        </div>
        <span className="chart-card__indicator" aria-hidden="true" />
      </div>
      {values.length === 0 ? (
        <div className="chart-empty">この期間のデータはありません</div>
      ) : (
        <div className="chart-card__plot" role="img" aria-label={title + "の時系列グラフ"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: -14, bottom: 2 }}>
              <CartesianGrid stroke="#293449" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tick={{ fill: "#91a1b9", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={(value: string) => formatDate(value, true)}
              />
              <YAxis
                domain={domain}
                tick={{ fill: "#91a1b9", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickCount={5}
                width={55}
                tickFormatter={(value: number) => dataKey === "co2" ? String(Math.round(value)) : value.toFixed(1)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#172239",
                  color: "#f2f6ff",
                  border: "1px solid #3a4962",
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0, 0, 0, .3)",
                }}
                labelStyle={{ color: "#c2cce0", marginBottom: 4 }}
                labelFormatter={(label) => formatDate(String(label))}
                formatter={(value) => {
                  const numeric = Number(value);
                  return [Number.isFinite(numeric) ? numeric.toFixed(dataKey === "co2" ? 0 : 1) + (unit ? " " + unit : "") : "—", title];
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, stroke: "#101827", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
