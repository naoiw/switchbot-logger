import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { LogRow } from "./sheetApi";

/** 縦軸の補助線（横線）の本数（全グラフで統一） */
const Y_TICK_COUNT = 5;

/** 縦軸の余白（表示データの min - padding 〜 max + padding が縦軸になる） */
const Y_PADDING_BY_KEY: Record<NumericDataKey, number> = {
  temperature: 1,
  humidity: 1,
  discomfortIndex: 2,
  co2: 5,
};

function getDomainWithPadding(values: number[], padding: number): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return [0, 100];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return [min - padding, max + padding];
}

type NumericDataKey = "temperature" | "humidity" | "discomfortIndex" | "co2";

interface ChartCardProps {
  title: string;
  unit: string;
  dataKey: NumericDataKey;
  data: LogRow[];
  color: string;
}

export function ChartCard({
  title,
  unit,
  dataKey,
  data,
  color,
}: ChartCardProps) {
  // スプレッドシート由来で数値が文字列になっている場合があるため Number で統一（null はそのまま）
  const chartData = data.map((row) => {
    const v = row[dataKey];
    const isEmptyString = typeof v === "string" && v === "";
    const num = v != null && !isEmptyString ? Number(v) : null;
    return { ...row, [dataKey]: num };
  });
  const values = chartData
    .map((d) => d[dataKey])
    .filter((v): v is number => v != null && Number.isFinite(v));
  const domain = getDomainWithPadding(values, Y_PADDING_BY_KEY[dataKey]);

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
        {title} ({unit})
      </h2>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => {
                const d = new Date(v);
                if (Number.isNaN(d.getTime())) return v;
                return d.toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }}
            />
            <YAxis
              domain={domain}
              tickCount={Y_TICK_COUNT}
              tick={{ fontSize: 11 }}
              width={36}
              tickFormatter={(v) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return String(v);
                return n.toFixed(1);
              }}
            />
            <Tooltip
              formatter={(value: number) => [value, title]}
              labelFormatter={(label) =>
                new Date(label).toLocaleString("ja-JP")
              }
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
