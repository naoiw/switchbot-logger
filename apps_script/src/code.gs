/**
 * SwitchBot CO₂センサーの計測値を、スプレッドシートの log シートに記録する。
 * トリガーは Apps Script の管理画面から5分間隔で設定する。
 *
 * 古い順に末尾へ追記し、最大2016件を保持する。
 */
const LOG_SHEET_NAME = "log";
const LOG_HEADERS = ["timestamp", "temperature", "humidity", "co2"];
const MAX_LOG_ENTRIES = 2016;
const HEADER_ROWS = 1;
const WRITE_LOCK_TIMEOUT_MS = 10000;

const API_MAX_ATTEMPTS = 3;
const API_RETRY_DELAY_MS = 500;

/** 定期トリガーから実行するエントリーポイント。 */
function recordEnvironment() {
  try {
    // API取得中はロックを保持しない。失敗したデータをシートに書き込まない。
    const measurement = fetchCurrentEnv();

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(WRITE_LOCK_TIMEOUT_MS)) {
      throw new Error("ログ書き込み用ロックを取得できませんでした");
    }

    try {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (!spreadsheet) {
        throw new Error("紐づくスプレッドシートがありません");
      }
      const sheet =
        spreadsheet.getSheetByName(LOG_SHEET_NAME) ||
        spreadsheet.insertSheet(LOG_SHEET_NAME);

      if (sheet.getLastRow() === 0) {
        sheet.appendRow(LOG_HEADERS);
      }

      // 取得時刻ではなく書き込み直前の時刻を採用し、並び順を保つ。
      const timestampSeconds = Math.floor(Date.now() / 1000);
      sheet.appendRow([
        timestampSeconds,
        measurement.temperature,
        measurement.humidity,
        measurement.co2,
      ]);

      const maxRows = HEADER_ROWS + MAX_LOG_ENTRIES;
      const overflow = sheet.getLastRow() - maxRows;
      if (overflow > 0) {
        // 古いデータはヘッダー直下にある。最新行は末尾に残す。
        sheet.deleteRows(HEADER_ROWS + 1, overflow);
      }

      // ロックを解放する前にスプレッドシートへの変更を確定する。
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    // APIトークン・シークレット・署名・レスポンス全文は出力しない。
    console.error("環境ログの記録に失敗: " + error.message);
    throw error;
  }
}

/**
 * SwitchBot OpenAPI v1.1から現在の計測値を取得する。
 * HTTP 429/5xx、API内部エラー190、通信例外のみを上限付きでリトライする。
 */
function fetchCurrentEnv() {
  const config = getSwitchBotConfig();
  const url =
    SWITCHBOT_API_BASE_URL +
    "/v1.1/devices/" +
    encodeURIComponent(config.deviceId) +
    "/status";

  for (let attempt = 1; attempt <= API_MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        method: "get",
        headers: buildSwitchBotHeaders(config),
        muteHttpExceptions: true,
      });
    } catch (_error) {
      // UrlFetchAppが投げる内部例外の内容にはリクエスト情報が含まれ得る。
      if (attempt < API_MAX_ATTEMPTS) {
        waitBeforeRetry(attempt);
        continue;
      }
      throw new Error("SwitchBot APIとの通信に失敗しました（最大試行回数に到達）");
    }

    const httpStatus = response.getResponseCode();
    if (httpStatus === 429 || httpStatus >= 500 && httpStatus <= 599) {
      if (attempt < API_MAX_ATTEMPTS) {
        waitBeforeRetry(attempt);
        continue;
      }
      throw new Error("SwitchBot APIが一時的なHTTPエラーを返しました: " + httpStatus);
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new Error("SwitchBot APIのHTTPエラー: " + httpStatus);
    }

    let payload;
    try {
      payload = JSON.parse(response.getContentText());
    } catch (_error) {
      throw new Error("SwitchBot APIのJSONレスポンスが不正です");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("SwitchBot APIのレスポンス形式が不正です");
    }

    // SwitchBotの成功コードはHTTP 200とは別の statusCode: 100。
    if (payload.statusCode !== 100) {
      if (payload.statusCode === 190 && attempt < API_MAX_ATTEMPTS) {
        waitBeforeRetry(attempt);
        continue;
      }
      throw new Error("SwitchBot APIの処理が失敗しました（statusCode: " +
        String(payload.statusCode) + "）");
    }
    return validateMeasurement(payload.body);
  }
  throw new Error("SwitchBot APIの取得試行回数を超えました");
}

/** APIの異常値を0や空欄として保存しない。 */
function validateMeasurement(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("SwitchBot APIの計測データがありません");
  }

  const temperature = requireFiniteNumber(body.temperature, "temperature");
  const humidity = requireFiniteNumber(body.humidity, "humidity");
  const co2 = requireFiniteNumber(body.CO2, "CO2");

  if (humidity < 0 || humidity > 100) {
    throw new Error("湿度が0〜100%の範囲外です");
  }
  if (co2 < 0) {
    throw new Error("CO2濃度が負の値です");
  }

  return { temperature, humidity, co2 };
}

function requireFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("SwitchBot APIの計測値が不正です: " + name);
  }
  return value;
}

function waitBeforeRetry(attempt) {
  Utilities.sleep(API_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
}
