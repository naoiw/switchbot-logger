# Apps Script — SwitchBotの環境データ収集

SwitchBot APIから温度・湿度・CO₂濃度を取得し、Googleスプレッドシートへ記録するGoogle Apps Script（GAS）の設定方法です。画面表示の仕様は[docs/SPEC.md](../docs/SPEC.md)を参照してください。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/code.gs` | `recordEnvironment`（記録）と `fetchCurrentEnv`（デバイス状態取得） |
| `src/util.gs` | APIエンドポイント、署名生成、認証用のプレースホルダー |

フロントエンドとは別にGASで稼働します。GitHub Pagesへのデプロイでトリガーが作成・更新されることはありません。

## 1. SwitchBot APIの認証情報

`src/util.gs` の次の値を、GASエディタ上で使用する環境に合わせて設定します。

| 変数 | 設定内容 |
| --- | --- |
| `token` | SwitchBot APIトークン |
| `secret` | APIシークレット |
| `device_id` | CO₂センサーのデバイスID |

**実際の認証情報をGitHubにコミットしないでください。** リポジトリ内の `****` はダミーです。本リポジトリにあるコードは、個々の利用者がGAS側で秘密情報を設定して使う想定です。

SwitchBot APIの取得方法の参考: [SwitchBot APIとGASの設定例（Qiita）](https://qiita.com/shiot/items/87d09495e3c3a2c1bdaf)

## 2. スプレッドシート

スプレッドシートのメニュー「拡張機能 → Apps Script」から紐づけたスクリプトとして実行します。スクリプトは `SpreadsheetApp.getActiveSpreadsheet()` を利用します。

- `log` シートがなければ初回実行時に作成します。
- 1行目に `timestamp, temperature, humidity, co2` のヘッダーを作ります。
- 最新のデータを2行目に追加します。
- 2016件を超えた古いデータを削除します（5分間隔なら約1週間）。

| 列 | ヘッダー | 値の例 |
| --- | --- | --- |
| A | `timestamp` | `1739251200`（UNIX秒） |
| B | `temperature` | `24.5`（°C） |
| C | `humidity` | `55`（%） |
| D | `co2` | `800`（ppm） |

**注意:** ダッシュボードからgvizで直接読み取るため、対象シートの共有範囲・公開データの内容は必ず確認してください。

## 3. トリガー

Apps Scriptエディタ左メニューの「トリガー → トリガーを追加」で以下のとおり設定します。

| 項目 | 設定値 |
| --- | --- |
| 実行する関数 | `recordEnvironment` |
| 実行するデプロイ | Head |
| イベントのソース | 時間主導型 |
| タイマーの種類 | 分ベース |
| 間隔 | 5分おき |

最初は `recordEnvironment` を手動実行し、認可とシートへの書き込みを確認してください。定期実行が止まった場合はGASのトリガー実行履歴・エラー通知を確認します。

## 4. フロントとの接続

- `src/code.gs` と `src/util.gs` をGASエディタにコピーし、GAS側で認証情報を設定します。
- `src/sheetApi.ts` の `SPREADSHEET_ID` を、読み取るシートに合わせます（リポジトリルートの `src/`）。
- ブラウザ側は `/gviz/tq?tqx=out:json` からデータを読み取ります。読み取り可能な共有設定が必要です。
- 列の順序やヘッダーを変更した場合、フロント側の変換処理も合わせて更新してください。
