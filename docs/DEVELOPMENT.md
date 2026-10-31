# 開発手順

## 動作環境

Node.js 20 / pnpm 9を使用します。`.nvmrc` と `package.json` の `packageManager` を参照してください。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

`pnpm build` はTypeScriptのチェック後にViteで `dist/` を生成します。 `pnpm test` はNodeの標準テストランナーを使用し、集計・表示範囲・日時処理の純粋関数を検証します。

## ブランチ運用

- **通常の修正は `develop`** に行い、`main` へ直接pushしません。
- 本番反映は `develop` → `main` のPull Requestを作成し、CI通過後にマージします。
- マージ後も `develop` は削除しません。`main` に入った変更を `develop` に取り込みます。
- `develop` の検証成功後、GitHub Pagesの `/develop/` にプレビューが反映されます。詳細は[DEPLOYMENT.md](DEPLOYMENT.md)。

```bash
git switch develop
git pull origin develop
# コードを変更
pnpm test
pnpm build
git add .
git commit -m "refactor: describe changes"
git push origin develop
# 動作を確認して develop -> main のPRを作成
```

## ディレクトリ構成

| パス | 役割 |
| --- | --- |
| `src/App.tsx` | ページの構成、ローディング・エラー、期間選択とエラー時の再試行 |
| `src/ChartCard.tsx` | 時系列グラフの表示 |
| `src/index.css` | 配色・レイアウト・レスポンシブ表示 |
| `src/metrics.ts` | 最新行・気温集計・値の表示・状態ラベル |
| `src/timeRange.ts` | 日時の解釈・件数指定の表示範囲 |
| `src/sheetApi.ts` | gvizレスポンスの解析と `LogRow` への変換 |
| `apps_script/src/` | SwitchBot APIの認証・取得とシートへの記録 |
| `tests/` | 集計・日時処理の回帰テスト |
| `docs/` | 実装と運用の仕様 |

## データ連携上の注意

- `sheetApi.ts` 内のスプレッドシートIDは現行の取得先を指しています。別のシートへ切り替える場合、IDとフロントからの読み取り権限を確認します。
- gvizのJSON形式・列順を変更するとフロントのパース処理も変更が必要です。
- GASの認証情報はScript Propertiesで管理し、**実際のトークン・シークレット・デバイスIDはコミットしない**でください。
- GASの記録方式は末尾追記です。旧ログの昇順移行が必要なため、コード反映前にGASトリガーを停止し、`log` シートをバックアップしてください。手順は[Apps Script README](../apps_script/README.md)を参照してください。
- WebサイトのソースやHTTP通信は公開されるため、フロント側へAPIトークンを入れてはいけません。
- GitHub Pagesのプレビューも公開アクセス可能です。プレビューだからといって機密データを含めないでください。

## 品質チェック

UI・集計・API・GASのいずれを変更した場合も `pnpm test` と `pnpm build` を実行します。GASのスクリプトはNode.jsのモックによるテストで検証し、本番反映時にはGASエディタでの手動確認も行います。認証情報はScript Propertiesで管理します。画面変更ではPC幅・スマホ幅、データ空・欠損・取得失敗時の再試行・期間切替を手動確認します。現時点でE2EやGAS実機テストはCIに含まれません。
