/** SwitchBot OpenAPIの認証・共通設定。秘密情報はScript Propertiesで管理する。 */
const SWITCHBOT_API_BASE_URL = "https://api.switch-bot.com";
const REQUIRED_PROPERTIES = [
  "SWITCHBOT_TOKEN",
  "SWITCHBOT_SECRET",
  "SWITCHBOT_DEVICE_ID",
];

/**
 * Apps Script > プロジェクトの設定 > スクリプト プロパティ から設定する。
 * 設定不足を起動時に検出し、秘密情報自体はログに出さない。
 */
function getSwitchBotConfig() {
  const properties = PropertiesService.getScriptProperties();
  const values = REQUIRED_PROPERTIES.map((name) =>
    (properties.getProperty(name) || "").trim()
  );
  const missing = REQUIRED_PROPERTIES.filter((_name, index) => !values[index]);
  if (missing.length > 0) {
    throw new Error("Script Propertiesが未設定です: " + missing.join(", "));
  }

  return {
    token: values[0],
    secret: values[1],
    deviceId: values[2],
  };
}

/** 各試行で新しいtimestamp・nonce・署名を生成する。 */
function buildSwitchBotHeaders(config) {
  const timestamp = String(Date.now()); // UNIXミリ秒
  const nonce = Utilities.getUuid();

  return {
    Authorization: config.token,
    sign: getSignature(config.token, config.secret, timestamp, nonce),
    t: timestamp,
    nonce: nonce,
  };
}

/**
 * 旧実装に合わせてHMAC-SHA256のBase64署名を大文字化する。
 * 署名方法は動作中の構成から変更せず、認証情報の管理のみ分離する。
 */
function getSignature(token, secret, timestamp, nonce) {
  const digest = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256,
    token + timestamp + nonce,
    secret
  );
  return Utilities.base64Encode(digest).toUpperCase();
}
