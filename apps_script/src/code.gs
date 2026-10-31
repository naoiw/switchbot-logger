/**
 * SwitchBot CO₂センサーの計測値を、スプレッドシートの log シートに記録する。
 * トリガーは Apps Script の管理画面から5分間隔で設定する。
 *
 * 最大2016件と列構成は従来どおり。記録は古い順へ移行し、末尾に追記する。
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

      // 旧データ（最新が2行目）を初回のみ昇順へ並べ替える。
      // 判定・移行・追記・削除は同じロック内で実行する。
      migrateLegacyLogOrder(sheet);

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
 * 旧方式（新しいデータが2行目）のログを一度だけ時刻昇順に並べ替える。
 *
 * 通常時は先頭と末尾のタイムスタンプ2セルのみ確認する。
 * 逆順の場合のみ全件を検証してからRange.sort()を使い、A～D列を行単位で
 * 並べ替える。既に昇順、データ0～1件の場合は書き換えない。
 * 日時不正・新旧混在など判断できない場合はデータを変更せずに停止する。
 */
function migrateLegacyLogOrder(sheet) {
  const lastRow = sheet.getLastRow();
  const count = lastRow - HEADER_ROWS;
  if (count < 2) return;

  const firstTimestamp = parseLogTimestamp(sheet.getRange(2, 1).getValue());
  const lastTimestamp = parseLogTimestamp(sheet.getRange(lastRow, 1).getValue());

  if (firstTimestamp <= lastTimestamp) return;

  const range = sheet.getRange(2, 1, count, LOG_HEADERS.length);
  const rows = range.getValues();
  let previousTimestamp = Infinity;

  for (const row of rows) {
    const timestamp = parseLogTimestamp(row[0]);
    if (timestamp > previousTimestamp) {
      throw new Error("既存ログの順序が混在しています。バックアップ後に手動で確認してください");
    }
    previousTimestamp = timestamp;
  }

  range.sort({ column: 1, ascending: true });
  console.info("旧ログを時刻昇順に移行しました: " + count + "件");
}

/** 保存形式はUNIX秒。未解釈の文字列や日時セルを自動的に並び替えない。 */
function parseLogTimestamp(value) {
  if (
    typeof value !== "number" && typeof value !== "string" ||
    String(value).trim() === ""
  ) {
    throw new Error("既存ログのタイムスタンプが不正です");
  }
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < 1e9 || timestamp >= 1e12) {
    throw new Error("既存ログのタイムスタンプがUNIX秒ではありません");
  }
  return timestamp;
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
