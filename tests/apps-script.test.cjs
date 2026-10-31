const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptRoot = path.join(__dirname, "..", "apps_script", "src");
const validResponse = {
  statusCode: 100,
  message: "success",
  body: { temperature: 23.5, humidity: 52, CO2: 790 },
};
const credentials = {
  SWITCHBOT_TOKEN: "fake-token",
  SWITCHBOT_SECRET: "fake-secret",
  SWITCHBOT_DEVICE_ID: "fake-device",
};
const headers = ["timestamp", "temperature", "humidity", "co2"];
const oldRow = (timestamp, value = 22) => [timestamp, value, 50, 800];

function setup(options = {}) {
  const existing = options.existingRows ??
    (options.initialRows
      ? Array.from({ length: options.initialRows - 1 }, (_v, i) => oldRow(1700000000 + i * 300))
      : []);
  const state = {
    calls: [], sleeps: [], signatures: [], errors: [], infos: [],
    append: [], sorts: [], reads: [], writes: [], deletes: [],
    flushCount: 0, released: 0, fetchCount: 0,
    sheetRows: options.initialRows === 0 || !options.initialRows && !existing.length
      ? []
      : [headers, ...existing.map((row) => [...row])],
  };
  const responses = options.responses ?? [{ http: 200, json: validResponse }];
  const properties = options.properties ?? credentials;
  const sheet = {
    getLastRow: () => state.sheetRows.length,
    appendRow: (row) => {
      state.append.push([...row]);
      state.sheetRows.push([...row]);
    },
    getRange: (row, col, numRows = 1, numCols = 1) => {
      const desc = { row, col, numRows, numCols };
      return {
        getValue: () => {
          state.reads.push({ ...desc, method: "getValue" });
          return state.sheetRows[row - 1]?.[col - 1] ?? "";
        },
        getValues: () => {
          state.reads.push({ ...desc, method: "getValues" });
          return Array.from({ length: numRows }, (_unused, index) =>
            (state.sheetRows[row - 1 + index] ?? []).slice(col - 1, col - 1 + numCols)
          );
        },
        setValues: (values) => {
          state.writes.push({ ...desc, values: values.map((r) => [...r]) });
          values.forEach((valuesRow, i) => {
            valuesRow.forEach((value, j) => {
              state.sheetRows[row - 1 + i][col - 1 + j] = value;
            });
          });
        },
        sort: (sortOptions) => {
          state.sorts.push({ ...desc, sortOptions });
          const reordered = state.sheetRows
            .slice(row - 1, row - 1 + numRows)
            .map((valuesRow) => [...valuesRow]);
          reordered.sort((a, b) => Number(a[sortOptions.column - col]) - Number(b[sortOptions.column - col]));
          if (sortOptions.ascending === false) reordered.reverse();
          state.sheetRows.splice(row - 1, numRows, ...reordered);
        },
      };
    },
    deleteRows: (start, count) => {
      state.deletes.push([start, count]);
      state.sheetRows.splice(start - 1, count);
    },
  };
  const sandbox = {
    console: {
      error: (message) => state.errors.push(message),
      info: (message) => state.infos.push(message),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties[key] ?? null,
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: (timeout) => {
          state.lockTimeout = timeout;
          return options.lockAvailable !== false;
        },
        releaseLock: () => { state.released++; },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        options.noSpreadsheet ? null : {
          getSheetByName: () => options.initialRows === undefined && !options.existingRows ? null : sheet,
          insertSheet: () => sheet,
        },
      flush: () => { state.flushCount++; },
    },
    Utilities: {
      MacAlgorithm: { HMAC_SHA_256: "sha256" },
      getUuid: () => "nonce-" + state.calls.length,
      computeHmacSignature: (...args) => {
        state.signatures.push(args);
        return [1, 2, 3];
      },
      base64Encode: () => "abcDef==",
      sleep: (ms) => { state.sleeps.push(ms); },
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        const index = state.fetchCount++;
        state.calls.push({ url, options });
        const reply = responses[Math.min(index, responses.length - 1)];
        if (reply.throw) throw new Error("Simulated network error");
        return {
          getResponseCode: () => reply.http,
          getContentText: () => reply.text ?? JSON.stringify(reply.json),
        };
      },
    },
  };
  vm.createContext(sandbox);
  for (const file of ["util.gs", "code.gs"]) {
    vm.runInContext(fs.readFileSync(path.join(scriptRoot, file), "utf8"), sandbox, { filename: file });
  }
  return { state, run: () => vm.runInContext("recordEnvironment()", sandbox) };
}

test("new sheet: header and one measurement are appended and lock released", () => {
  const { state, run } = setup();
  run();
  assert.equal(state.fetchCount, 1);
  assert.deepEqual(state.append[0], headers);
  assert.equal(state.append.length, 2);
  assert.equal(state.append[1][1], 23.5);
  assert.equal(state.append[1][2], 52);
  assert.equal(state.append[1][3], 790);
  assert.match(String(state.append[1][0]), /^\d{10}$/);
  assert.equal(state.sorts.length, 0);
  assert.equal(state.flushCount, 1);
  assert.equal(state.released, 1);
  assert.equal(state.lockTimeout, 10000);
  assert.equal(state.calls[0].options.headers.Authorization, "fake-token");
  assert.equal(state.calls[0].options.headers.sign, "ABCDEF==");
  assert.deepEqual(state.signatures[0].slice(0, 2), [
    "sha256", "fake-token" + state.calls[0].options.headers.t + "nonce-0",
  ]);
});

test("existing ascending sheet: append without sorting or rewriting historical rows", () => {
  const rows = [oldRow(1700000000), oldRow(1700000300), oldRow(1700000600)];
  const { state, run } = setup({ existingRows: rows });
  run();
  assert.equal(state.append.length, 1);
  assert.deepEqual(state.sheetRows.slice(1, -1), rows);
  assert.equal(state.sorts.length, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(state.reads.filter((read) => read.method === "getValues").length, 0);
  assert.equal(state.reads.length, 2);
});

test("legacy descending sheet: migrate all four columns together, then append", () => {
  const rows = [
    oldRow(1700000900, 24),
    oldRow(1700000600, 23),
    oldRow(1700000300, 22),
    oldRow(1700000000, 21),
  ];
  const { state, run } = setup({ existingRows: rows });
  run();
  assert.equal(state.sorts.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.sorts[0])), {
    row: 2, col: 1, numRows: 4, numCols: 4,
    sortOptions: { column: 1, ascending: true },
  });
  assert.deepEqual(state.sheetRows.slice(1, -1), rows.slice().reverse());
  assert.equal(state.append.length, 1);
  assert.match(state.infos[0], /4件/);
  assert.equal(state.writes.length, 0);
  assert.equal(state.released, 1);
});

test("second run: migration is not repeated", () => {
  const { state, run } = setup({
    existingRows: [oldRow(1700000600), oldRow(1700000300), oldRow(1700000000)],
  });
  run();
  run();
  assert.equal(state.sorts.length, 1);
  assert.equal(state.append.length, 2);
  assert.equal(state.flushCount, 2);
});

test("one historical log: append directly without migration", () => {
  const { state, run } = setup({ existingRows: [oldRow(1700000000)] });
  run();
  assert.equal(state.sorts.length, 0);
  assert.equal(state.append.length, 1);
});

test("mixed legacy order: fail without modifying or appending any logs", () => {
  const { state, run } = setup({
    existingRows: [
      oldRow(1700000900),
      oldRow(1700000000),
      oldRow(1700000600),
      oldRow(1700000300),
    ],
  });
  assert.throws(run, /順序が混在/);
  assert.equal(state.append.length, 0);
  assert.equal(state.sorts.length, 0);
  assert.equal(state.flushCount, 0);
  assert.equal(state.released, 1);
});

test("invalid timestamp: prevent unintended migration and stop write", () => {
  for (const rows of [
    [oldRow("not a timestamp"), oldRow(1700000000)],
    [oldRow(1700000900), oldRow("bad")],
    [oldRow(1700000900), oldRow("bad"), oldRow(1700000000)],
  ]) {
    const { state, run } = setup({ existingRows: rows });
    assert.throws(run, /タイムスタンプ/);
    assert.equal(state.sorts.length, 0);
    assert.equal(state.append.length, 0);
  }
});

test("retention: delete oldest rows from row 2 and retain 2016 logs", () => {
  const { state, run } = setup({ initialRows: 2017 });
  run();
  assert.deepEqual(state.deletes, [[2, 1]]);
  assert.equal(state.sheetRows.length, 2017);
  assert.equal(state.sheetRows[1][0], 1700000300);
  assert.equal(state.append.length, 1);
  assert.equal(state.released, 1);
});

test("retention after descending legacy migration: retains newest 2016", () => {
  const rows = Array.from({ length: 2016 }, (_v, i) => oldRow(1700000000 + (2015 - i) * 300));
  const { state, run } = setup({ existingRows: rows });
  run();
  assert.equal(state.sorts.length, 1);
  assert.deepEqual(state.deletes, [[2, 1]]);
  assert.equal(state.sheetRows[1][0], 1700000300);
  assert.equal(state.sheetRows.length, 2017);
});

test("configuration error: refuse to contact API or modify sheet", () => {
  const { state, run } = setup({ properties: { SWITCHBOT_TOKEN: "fake-token" } });
  assert.throws(run, /SWITCHBOT_SECRET, SWITCHBOT_DEVICE_ID/);
  assert.equal(state.fetchCount, 0);
  assert.equal(state.append.length, 0);
  assert.ok(state.errors.every((message) => !message.includes("fake-token")));
});

test("HTTP 401: does not retry and does not write", () => {
  const { state, run } = setup({ responses: [{ http: 401 }] });
  assert.throws(run, /HTTPエラー: 401/);
  assert.equal(state.fetchCount, 1);
  assert.equal(state.append.length, 0);
});

test("HTTP 500/429: bounded retries with fresh nonce", () => {
  const { state, run } = setup({
    responses: [{ http: 500 }, { http: 429 }, { http: 200, json: validResponse }],
  });
  run();
  assert.equal(state.fetchCount, 3);
  assert.deepEqual(state.sleeps, [500, 1000]);
  assert.deepEqual(state.calls.map((call) => call.options.headers.nonce), [
    "nonce-0", "nonce-1", "nonce-2",
  ]);
  assert.equal(state.append.length, 2);
});

test("HTTP 503: fails after at most three attempts", () => {
  const { state, run } = setup({ responses: [{ http: 503 }] });
  assert.throws(run, /HTTPエラーを返しました: 503/);
  assert.equal(state.fetchCount, 3);
  assert.deepEqual(state.sleeps, [500, 1000]);
  assert.equal(state.append.length, 0);
});

test("network exception: bounded retries and no write", () => {
  const { state, run } = setup({ responses: [{ throw: true }] });
  assert.throws(run, /通信に失敗しました/);
  assert.equal(state.fetchCount, 3);
  assert.equal(state.append.length, 0);
});

test("API statusCode 190 retries, other non-100 codes fail", () => {
  const retry = setup({
    responses: [
      { http: 200, json: { statusCode: 190, message: "System error" } },
      { http: 200, json: validResponse },
    ],
  });
  retry.run();
  assert.equal(retry.state.fetchCount, 2);
  const invalid = setup({ responses: [{ http: 200, json: { statusCode: 400 } }] });
  assert.throws(invalid.run, /statusCode: 400/);
  assert.equal(invalid.state.fetchCount, 1);
});

test("malformed JSON and invalid readings never reach the sheet", () => {
  const responses = [
    { http: 200, text: "not json" },
    { http: 200, json: { statusCode: 100, body: {} } },
    { http: 200, json: { statusCode: 100, body: { temperature: 22, humidity: 101, CO2: 600 } } },
    { http: 200, json: { statusCode: 100, body: { temperature: "22", humidity: 50, CO2: 600 } } },
    { http: 200, json: { statusCode: 100, body: { temperature: 22, humidity: 50, CO2: -1 } } },
  ];
  for (const response of responses) {
    const { state, run } = setup({ responses: [response] });
    assert.throws(run);
    assert.equal(state.append.length, 0);
    assert.equal(state.flushCount, 0);
  }
});

test("lock contention: never modifies the sheet", () => {
  const { state, run } = setup({ lockAvailable: false });
  assert.throws(run, /ロックを取得できませんでした/);
  assert.equal(state.fetchCount, 1);
  assert.equal(state.append.length, 0);
  assert.equal(state.released, 0);
});
