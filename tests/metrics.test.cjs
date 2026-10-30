const { test } = require("node:test");
const assert = require("node:assert/strict");
const { filterRowsByCount, parseTimestamp } = require("./dist/timeRange.js");
const { getLatestRow, getTemperatureStats, formatMetric, getStatusLabel } = require("./dist/metrics.js");

const record = (timestamp, temperature, humidity = 45) => ({
  timestamp, temperature, humidity, co2: 650, discomfortIndex: 70,
});

test("timestamp supports UNIX seconds, ISO, and invalid input", () => {
  assert.equal(parseTimestamp("1739251200")?.getTime(), 1739251200000);
  assert.equal(parseTimestamp("2026-01-01T00:00:00Z")?.getUTCFullYear(), 2026);
  assert.equal(parseTimestamp("invalid"), null);
});

test("range selection sorts by timestamp, excluding invalid values", () => {
  const rows = [record("2026-01-03", 24), record("invalid", 25), record("2026-01-01", 21), record("2026-01-02", 22)];
  assert.deepEqual(filterRowsByCount(rows, 2).map((row) => row.temperature), [22, 24]);
  assert.equal(getLatestRow(rows)?.temperature, 24);
});

test("temperature stats ignore missing and non-finite values", () => {
  const rows = [record("2026-01-01", null), record("2026-01-02", 23.5), record("2026-01-03", 20), record("2026-01-04", Infinity)];
  assert.deepEqual(getTemperatureStats(rows), { min: 20, max: 23.5 });
  assert.deepEqual(getTemperatureStats([]), { min: null, max: null });
  assert.equal(getLatestRow([record("invalid", 20)]), null);
});

test("value formatting and labels handle missing values", () => {
  assert.equal(formatMetric(null), "—");
  assert.equal(formatMetric(21.27, "°C"), "21.3");
  assert.equal(formatMetric(821.4, "ppm"), "821");
  assert.equal(getStatusLabel("co2", 1200), "換気を推奨");
  assert.equal(getStatusLabel("humidity", 60), null);
});
