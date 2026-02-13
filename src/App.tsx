import { useEffect, useMemo, useState } from "react";
import { fetchLogData, type LogRow } from "./sheetApi";
import {
  TIME_RANGES,
  filterRowsByCount,
  parseTimestamp,
  type TimeRangeKey,
} from "./timeRange";
import { ChartCard } from "./ChartCard";

/** 最新1件の行を取得（タイムスタンプが最も新しい行） */
function getLatestRow(rows: LogRow[]): LogRow | null {
  if (rows.length === 0) return null;
  const withDate = rows
    .map((row) => ({ row, date: parseTimestamp(row.timestamp) }))
    .filter((x): x is { row: LogRow; date: Date } => x.date != null);
  if (withDate.length === 0) return null;
  withDate.sort((a, b) => a.date.getTime() - b.date.getTime());
  return withDate[withDate.length - 1].row;
}

function App() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRangeLabel, setTimeRangeLabel] =
    useState<TimeRangeKey>("1日");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLogData()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rangeCount = useMemo(
    () => TIME_RANGES.find((r) => r.label === timeRangeLabel)?.count ?? TIME_RANGES[2].count,
    [timeRangeLabel]
  );
  const filteredRows = useMemo(
    () => filterRowsByCount(rows, rangeCount),
    [rows, rangeCount]
  );
  const latestRow = useMemo(() => getLatestRow(rows), [rows]);

  if (loading) return <p>読み込み中…</p>;
  if (error) return <p>エラー: {error}</p>;

  const formatValue = (v: number | null, unit: string) =>
    v != null && Number.isFinite(v)
      ? unit ? `${v.toFixed(1)} ${unit}` : v.toFixed(1)
      : "—";

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1>SwitchBot CO2センサー（温湿度計） データログ</h1>

      {latestRow && (
        <section
          style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            background: "#f8f9fa",
            borderRadius: 8,
            border: "1px solid #e9ecef",
          }}
        >
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", color: "#495057" }}>
            現在の値
            {latestRow.timestamp && (
              <span style={{ fontWeight: 400, marginLeft: "0.5rem" }}>
                （{parseTimestamp(latestRow.timestamp)?.toLocaleString("ja-JP") ?? latestRow.timestamp}）
              </span>
            )}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <span style={{ fontSize: "0.8rem", color: "#6c757d" }}>温度</span>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#e74c3c" }}>
                {formatValue(latestRow.temperature, "℃")}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.8rem", color: "#6c757d" }}>湿度</span>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#3498db" }}>
                {formatValue(latestRow.humidity, "%")}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.8rem", color: "#6c757d" }}>不快指数</span>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#9b59b6" }}>
                {formatValue(latestRow.discomfortIndex, "")}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.8rem", color: "#6c757d" }}>CO2濃度</span>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#27ae60" }}>
                {formatValue(latestRow.co2, "ppm")}
              </div>
            </div>
          </div>
        </section>
      )}

      <p>取得件数: {rows.length} 件（表示: {filteredRows.length} 件）</p>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ alignSelf: "center", marginRight: "0.25rem" }}>
          横軸:
        </span>
        {TIME_RANGES.map(({ label }) => (
          <button
            key={label}
            type="button"
            onClick={() => setTimeRangeLabel(label)}
            style={{
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
              border: timeRangeLabel === label ? "2px solid #333" : "1px solid #ccc",
              borderRadius: 4,
              background: timeRangeLabel === label ? "#f0f0f0" : "#fff",
              fontWeight: timeRangeLabel === label ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <ChartCard
        title="温度"
        unit="℃"
        dataKey="temperature"
        data={filteredRows}
        color="#e74c3c"
      />
      <ChartCard
        title="湿度"
        unit="%"
        dataKey="humidity"
        data={filteredRows}
        color="#3498db"
      />
      <ChartCard
        title="不快指数"
        unit="—"
        dataKey="discomfortIndex"
        data={filteredRows}
        color="#9b59b6"
      />
      <ChartCard
        title="CO2"
        unit="ppm"
        dataKey="co2"
        data={filteredRows}
        color="#27ae60"
      />
    </div>
  );
}

export default App;
