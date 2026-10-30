# SwitchBot Logger

SwitchBot CO₂センサー（温湿度計）の記録をブラウザで確認する、室内環境ダッシュボードです。Google Apps Scriptで計測値をスプレッドシートに蓄積し、Reactで最新値と時系列グラフを表示します。

## 主な機能

- **最新値** — 温度、湿度、不快指数、CO₂濃度をカードで一覧表示
- **時系列グラフ** — 1時間 / 12時間 / 1日 / 1週間の表示切り替え
- **気温の振り返り** — 直近288件（5分間隔で約24時間）の最高・最低値
- **操作性** — PC・スマートフォン向けのレスポンシブ表示、取得失敗時の再試行

## 公開先

| 環境 | ブランチ | URL |
| --- | --- | --- |
| 本番 | `main` | https://naoiw.github.io/switchbot-logger/ |
| 開発プレビュー | `develop` | https://naoiw.github.io/switchbot-logger/develop/ |

本番と開発プレビューは**1つの GitHub Pages サイト**にまとめて公開します。新しい運用はワークフローを `main` に取り込んだ後に有効になります。

## 技術スタック

- **TypeScript / React 18 / Recharts** — ダッシュボードと折れ線グラフ
- **CSS / Vite** — スタイル・開発・ビルド
- **Google Apps Script / Google Sheets** — センサーデータの収集・保存と公開用読み取り
- **Node.js 20 / pnpm 9** — ローカル開発・テスト・ビルド
- **GitHub Actions / GitHub Pages** — 検証と公開

## ローカル開発

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev      # 開発サーバー
pnpm test     # 集計・期間選択の回帰テスト
pnpm build    # 型チェック＋本番ビルド
```

`pnpm dev` でViteの開発サーバーを起動します。現状のデータ取得先は `src/sheetApi.ts` の `SPREADSHEET_ID` に指定されたスプレッドシートです。自分のシートを使う場合は、IDと読み取り権限を確認してください。

**注意:** ブラウザから Google Sheets の gviz エンドポイントを直接読み取る構成です。計測データとシートIDは閲覧者に見えるため、非公開データや認証情報を置かないでください。SwitchBotのAPIトークン等はGAS側だけで扱います。

## ブランチ運用

1. 実装は `develop` で行い、`main` は本番専用にします。
2. `develop` へのpushでテスト・ビルドし、成功した版を開発プレビューに公開します。
3. `main` への反映は **`develop` → `main` のPull Request** で行います。PRでは検証のみ行い、公開しません。
4. マージ後も `develop` は残し、`main` と同期して使います。

## ディレクトリ構成

- `src/` — Reactの画面・グラフ、スタイル、集計ロジック、スプレッドシート連携
- `apps_script/` — 5分ごとにSwitchBot APIからデータを取得するGAS
- `tests/` — 集計・日時処理の自動テスト
- `.github/workflows/` — CIとPagesデプロイ
- `docs/` — 詳細仕様、開発手順、デプロイ構成

## ドキュメント

- [画面・データ仕様](docs/SPEC.md)
- [開発手順](docs/DEVELOPMENT.md)
- [デプロイ構成](docs/DEPLOYMENT.md)
- [Apps Scriptの設定・運用](apps_script/README.md)

## ライセンス

[MIT License](LICENSE)
