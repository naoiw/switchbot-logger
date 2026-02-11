import { useEffect, useMemo, useState } from "react";
import { fetchLogData, type LogRow } from "./sheetApi";
import {
  TIME_RANGES,
  filterRowsByCount,
  type TimeRangeKey,
} from "./timeRange";
import { ChartCard } from "./ChartCard";

function App() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRangeLabel, setTimeRangeLabel] =
    useState<TimeRangeKey>("1週間");

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
    () => TIME_RANGES.find((r) => r.label === timeRangeLabel)?.count ?? TIME_RANGES[3].count,
    [timeRangeLabel]
  );
  const filteredRows = useMemo(
    () => filterRowsByCount(rows, rangeCount),
    [rows, rangeCount]
  );

  if (loading) return <p>読み込み中…</p>;
  if (error) return <p>エラー: {error}</p>;

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1>スイッチボット ログ</h1>
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
