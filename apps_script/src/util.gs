const base_url = "https://api.switch-bot.com"

// SwitchBot Appより
const token = "****"
const secret = "****"

// 温湿度デバイスID
const device_id = "****"


// NonceとしてUUIDを生成する関数
function makeNonce() {
  return Utilities.getUuid();
}

// 現在のUNIXTIMEを文字列で返す関数
function getUnixTimeString() {
  const date = new Date();
  return date.getTime().toString()
}

// SwitchBotAPIの署名を発行する関数
function getSignature(timestamp, nonce) {
  const signature = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, token + timestamp + nonce, secret)
  return Utilities.base64Encode(signature).toUpperCase()
}
