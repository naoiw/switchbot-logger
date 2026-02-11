function recordEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'log';
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  // ヘッダーがなければ作る
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'temperature', 'humidity', 'co2']);
  }

  // データ取得
  const data = fetchCurrentEnv(); // 下で定義
  //const now = new Date();
  const now = Math.floor(Date.now() / 1000);

  // 最新データを2行目に挿入（常に新しい順）
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, 4).setValues([[
    now,
    data.temp,
    data.humi,
    data.co2
  ]]);

  // 1週間（2016件）超えたら古いデータを削除
  const maxRows = 2016 + 1; // ヘッダー含む
  if (sheet.getLastRow() > maxRows) {
    sheet.deleteRows(maxRows + 1, sheet.getLastRow() - maxRows);
  }
}

function fetchCurrentEnv() {
  const path = '/v1.1/devices/' + device_id + '/status';
  const nonce = makeNonce();
  const timestamp = getUnixTimeString();
  const sign = getSignature(timestamp, nonce);

  const headers = {
    'Authorization': token,
    'sign': sign,
    't': timestamp,
    'nonce': nonce
  };

  const options = {
    method: 'GET',
    headers: headers,
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(base_url + path, options);
  const jsonBody = JSON.parse(res.getContentText()).body;

  return {
    temp: jsonBody.temperature,
    humi: jsonBody.humidity,
    co2: jsonBody.CO2
  };
}
