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

function setup(options = {}) {
  const state = {
    calls: [],
    sleeps: [],
    signatures: [],
    errors: [],
    append: [],
    inserts: [],
    values: [],
    deletes: [],
    flushCount: 0,
    released: 0,
    rows: options.initialRows ?? 0,
    fetchCount: 0,
  };
  const responses = options.responses ?? [{ http: 200, json: validResponse }];
  const properties = options.properties ?? credentials;
  const sheet = {
    getLastRow: () => state.rows,
    appendRow: (row) => { state.append.push([...row]); state.rows++; },
    insertRowBefore: (index) => { state.inserts.push(index); state.rows++; },
    getRange: (...args) => ({
      setValues: (values) => { state.values.push(JSON.parse(JSON.stringify({ args, values }))); },
    }),
    deleteRows: (start, count) => {
      state.deletes.push([start, count]);
      state.rows -= count;
    },
  };
  const sandbox = {
    console: { error: (value) => state.errors.push(value) },
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
          getSheetByName: () => options.initialRows === undefined ? null : sheet,
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
    const source = fs.readFileSync(path.join(scriptRoot, file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  }
  return { state, run: () => vm.runInContext("recordEnvironment()", sandbox) };
}

test("success: writes same column order/newest-first and flushes before releasing lock", () => {
  const { state, run } = setup();
  run();
  assert.equal(state.fetchCount, 1);
  assert.deepEqual(state.append, [["timestamp", "temperature", "humidity", "co2"]]);
  assert.deepEqual(state.inserts, [2]);
  assert.equal(state.values[0].values[0][1], 23.5);
  assert.equal(state.values[0].values[0][2], 52);
  assert.equal(state.values[0].values[0][3], 790);
  assert.match(String(state.values[0].values[0][0]), /^\d{10}$/);
  assert.equal(state.flushCount, 1);
  assert.equal(state.released, 1);
  assert.equal(state.lockTimeout, 10000);
  assert.equal(state.calls[0].options.headers.Authorization, "fake-token");
  assert.equal(state.calls[0].options.headers.sign, "ABCDEF==");
  assert.deepEqual(state.signatures[0].slice(0, 2), ["sha256", "fake-token" + state.calls[0].options.headers.t + "nonce-0"]);
});

test("configuration error: refuses to call API or write", () => {
  const { state, run } = setup({ properties: { SWITCHBOT_TOKEN: "fake-token" } });
  assert.throws(run, /SWITCHBOT_SECRET, SWITCHBOT_DEVICE_ID/);
  assert.equal(state.fetchCount, 0);
  assert.equal(state.inserts.length, 0);
  assert.ok(state.errors.every((entry) => !entry.includes("fake-token")));
});

test("HTTP 401: does not retry and does not write", () => {
  const { state, run } = setup({ responses: [{ http: 401 }] });
  assert.throws(run, /HTTPエラー: 401/);
  assert.equal(state.fetchCount, 1);
  assert.equal(state.inserts.length, 0);
});

test("HTTP 500/429: retries with a fresh nonce and bounded backoff", () => {
  const { state, run } = setup({
    responses: [{ http: 500 }, { http: 429 }, { http: 200, json: validResponse }],
  });
  run();
  assert.equal(state.fetchCount, 3);
  assert.deepEqual(state.sleeps, [500, 1000]);
  assert.deepEqual(state.calls.map((call) => call.options.headers.nonce), ["nonce-0", "nonce-1", "nonce-2"]);
  assert.equal(state.inserts.length, 1);
});

test("HTTP 503: fails after at most three attempts", () => {
  const { state, run } = setup({ responses: [{ http: 503 }] });
  assert.throws(run, /HTTPエラーを返しました: 503/);
  assert.equal(state.fetchCount, 3);
  assert.deepEqual(state.sleeps, [500, 1000]);
  assert.equal(state.inserts.length, 0);
});

test("network exception: bounded retries and no leaked error content", () => {
  const { state, run } = setup({ responses: [{ throw: true }] });
  assert.throws(run, /通信に失敗しました/);
  assert.equal(state.fetchCount, 3);
  assert.equal(state.inserts.length, 0);
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
    assert.equal(state.inserts.length, 0);
    assert.equal(state.flushCount, 0);
  }
});

test("write lock contention: never modifies the sheet", () => {
  const { state, run } = setup({ lockAvailable: false });
  assert.throws(run, /ロックを取得できませんでした/);
  assert.equal(state.fetchCount, 1);
  assert.equal(state.inserts.length, 0);
  assert.equal(state.released, 0);
});

test("data retention: keeps header plus newest 2016 entries", () => {
  const { state, run } = setup({ initialRows: 2017 });
  run();
  assert.deepEqual(state.append, []);
  assert.deepEqual(state.deletes, [[2018, 1]]);
  assert.equal(state.rows, 2017);
  assert.equal(state.released, 1);
});
