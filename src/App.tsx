import { useEffect, useMemo, useState } from "react";
import { ChartCard } from "./ChartCard";
import { METRICS, formatMetric, getLatestRow, getStatusLabel, getTemperatureStats } from "./metrics";
import { fetchLogData, type LogRow } from "./sheetApi";
import { TIME_RANGES, filterRowsByCount, parseTimestamp, type TimeRangeKey } from "./timeRange";

const CHART_COLORS: Record<string, string> = {
  temperature: "#ff9e87",
  humidity: "#72bcff",
  discomfortIndex: "#c8a9ff",
  co2: "#6ddbb9",
};

function formatTimestamp(timestamp: string): string {
  const parsed = parseTimestamp(timestamp);
  return parsed
    ? parsed.toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : timestamp;
}

export default function App() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("1日");
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchLogData()
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setLastFetchedAt(new Date());
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [retryKey]);

  const selectedCount = TIME_RANGES.find((range) => range.label === timeRange)?.count ?? 288;
  const visibleRows = useMemo(() => filterRowsByCount(rows, selectedCount), [rows, selectedCount]);
  const latest = useMemo(() => getLatestRow(rows), [rows]);
  const temperatureStats = useMemo(() => getTemperatureStats(rows), [rows]);
  const retry = () => setRetryKey((key) => key + 1);

  return (
    <div className="site-shell">
      <div className="ambient ambient--left" aria-hidden="true" />
      <div className="ambient ambient--right" aria-hidden="true" />
      <main className="dashboard">
        <header className="page-header">
          <div className="brand">
            <div className="brand__mark" aria-hidden="true"><span /><span /><span /></div>
            <span>SWITCHBOT <strong>LOGGER</strong></span>
          </div>
          <span className="header-caption">ENVIRONMENT MONITOR</span>
        </header>

        <section className="hero" aria-labelledby="page-title">
          <div>
            <p className="eyebrow hero__eyebrow"><span className="status-dot" /> ROOM CLIMATE OVERVIEW</p>
            <h1 id="page-title">室内環境ダッシュボード</h1>
            <p className="hero__description">温度・湿度・不快指数・CO₂濃度を、ひとつの画面で。</p>
          </div>
          <div className="hero__aside">
            <span className="eyebrow">LATEST MEASUREMENT</span>
            <strong>{latest ? formatTimestamp(latest.timestamp) : "—"}</strong>
            <span className="hero__hint">センサーの最終記録時刻</span>
          </div>
        </section>

        {error && (
          <div className="notice notice--error" role="alert">
            <div><strong>データを取得できませんでした</strong><p>通信環境やスプレッドシートの共有設定をご確認ください。詳細: {error}</p></div>
            <button type="button" onClick={retry}>再試行</button>
          </div>
        )}

        <section className="overview" aria-labelledby="overview-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE SNAPSHOT</p>
              <h2 id="overview-title">最新の計測値</h2>
            </div>
            <span className="section-heading__meta">5分間隔で記録されるデータを表示</span>
          </div>
          <div className="metric-grid">
            {METRICS.map((metric) => {
              const value = latest?.[metric.key] ?? null;
              const status = getStatusLabel(metric.key, value);
              return (
                <article className="metric-card" key={metric.key} data-tone={metric.tone}>
                  <div className="metric-card__top">
                    <span className="metric-card__label">{metric.label}</span>
                    <span className="metric-card__icon" aria-hidden="true">{metric.icon}</span>
                  </div>
                  <div className="metric-card__reading">
                    <strong>{formatMetric(value, metric.unit)}</strong>
                    {metric.unit && <span>{metric.unit}</span>}
                  </div>
                  <div className="metric-card__bottom">
                    <span className="metric-card__rule" aria-hidden="true" />
                    <span>{status ?? (value == null ? "データなし" : "最新の記録")}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="summary-strip" aria-label="最近の気温">
          <div className="summary-strip__title">
            <span aria-hidden="true">↗</span>
            <div><strong>直近の気温</strong><small>5分間隔の直近288件（約24時間）</small></div>
          </div>
          <div className="summary-strip__stats">
            <div><span>最高</span><strong>{formatMetric(temperatureStats.max, "°C")} <small>°C</small></strong></div>
            <div><span>最低</span><strong>{formatMetric(temperatureStats.min, "°C")} <small>°C</small></strong></div>
          </div>
        </section>

        <section className="trends" aria-labelledby="trends-title">
          <div className="section-heading section-heading--trends">
            <div>
              <p className="eyebrow">HISTORICAL DATA</p>
              <h2 id="trends-title">計測データの推移</h2>
              <p className="section-heading__meta">取得 {rows.length.toLocaleString("ja-JP")} 件 / 表示 {visibleRows.length.toLocaleString("ja-JP")} 件</p>
            </div>
            <div className="range-picker" role="group" aria-label="表示期間">
              {TIME_RANGES.map((range) => (
                <button
                  type="button"
                  key={range.label}
                  className={timeRange === range.label ? "range-picker__button is-active" : "range-picker__button"}
                  onClick={() => setTimeRange(range.label)}
                  aria-pressed={timeRange === range.label}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-grid">
            {METRICS.map((metric) => (
              <ChartCard
                key={metric.key}
                title={metric.label}
                dataKey={metric.key}
                unit={metric.unit}
                data={visibleRows}
                tone={metric.tone}
                color={CHART_COLORS[metric.key]}
              />
            ))}
          </div>
          <p className="chart-footnote">表示期間は5分ごとに記録されたデータ件数から換算しています。欠測がある場合、実際の経過時間と異なります。</p>
        </section>

        <footer className="page-footer">
          <span>SwitchBot Logger · Google Sheets / Apps Script</span>
          <span>{lastFetchedAt ? "最終取得: " + lastFetchedAt.toLocaleTimeString("ja-JP") : isLoading ? "データ取得中…" : "未取得"}</span>
        </footer>
      </main>
    </div>
  );
}
