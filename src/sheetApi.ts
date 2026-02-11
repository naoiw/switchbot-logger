/** スプレッドシートID（仕様で指定） */
const SPREADSHEET_ID = "1TkPYZyWLQvhM5Z9XwfSpfPE9gFQvquFN69X0zb6PGPk";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

/** 1行分のログデータ（A: タイムスタンプ, B: 温度, C: 湿度, D: CO2） */
export interface LogRow {
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  /** 不快指数: 0.81×気温 + 0.01×湿度×(0.99×気温 - 14.3) + 46.3（気温・湿度どちらか欠損時は null） */
  discomfortIndex: number | null;
}

/**
 * 不快指数を計算する。
 * 式: 0.81 × 気温 + 0.01 × 湿度 × (0.99 × 気温 - 14.3) + 46.3
 */
function calcDiscomfortIndex(temperature: number, humidity: number): number {
  return 0.81 * temperature + 0.01 * humidity * (0.99 * temperature - 14.3) + 46.3;
}

/** gviz のセル（値は .v） */
interface GvizCell {
  v?: string | number;
  f?: string;
}

function getCellNumber(c: GvizCell | null | undefined): number | null {
  if (c?.v == null || c.v === "") return null;
  const n = Number(c.v);
  return Number.isFinite(n) ? n : null;
}

function getCellString(c: GvizCell | null | undefined): string {
  if (c == null) return "";
  const raw = c.f ?? c.v;
  if (raw == null || raw === "") return "";
  return String(raw);
}

/**
 * スプレッドシートからデータを取得し、LogRow の配列に変換する。
 * 2行目～1009行目を想定（1行目はヘッダのためスキップ）。空セルは null。
 */
export async function fetchLogData(): Promise<LogRow[]> {
  const res = await fetch(SHEET_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2)) as {
    table?: { rows?: { c?: (GvizCell | null)[] }[] };
  };
  const rows = json.table?.rows ?? [];
  const result: LogRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row?.c ?? [];
    const temperature = getCellNumber(cells[1]);
    const humidity = getCellNumber(cells[2]);
    result.push({
      timestamp: getCellString(cells[0]),
      temperature,
      humidity,
      co2: getCellNumber(cells[3]),
      discomfortIndex:
        temperature != null && humidity != null
          ? calcDiscomfortIndex(temperature, humidity)
          : null,
    });
  }
  return result;
}
