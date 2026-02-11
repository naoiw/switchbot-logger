import { useEffect, useState } from "react";
import { fetchLogData, type LogRow } from "./sheetApi";

function App() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p>読み込み中…</p>;
  if (error) return <p>エラー: {error}</p>;

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h1>スイッチボット ログ一覧</h1>
      <p>取得件数: {rows.length} 件</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "480px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
              <th style={thStyle}>タイムスタンプ</th>
              <th style={thStyle}>温度(℃)</th>
              <th style={thStyle}>湿度(%)</th>
              <th style={thStyle}>CO2(ppm)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={tdStyle}>{row.timestamp || "—"}</td>
                <td style={tdStyle}>
                  {row.temperature != null ? row.temperature : "—"}
                </td>
                <td style={tdStyle}>
                  {row.humidity != null ? row.humidity : "—"}
                </td>
                <td style={tdStyle}>{row.co2 != null ? row.co2 : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
};

export default App;
