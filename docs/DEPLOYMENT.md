# GitHub Pages デプロイ

## 公開構成

本番とプレビューを1つの `github-pages` Environment・1つのPagesアーティファクトで配信します。

| 対象 | URL | ソース |
| --- | --- | --- |
| 本番 | https://naoiw.github.io/switchbot-logger/ | `main` |
| プレビュー | https://naoiw.github.io/switchbot-logger/develop/ | `develop` |

Viteの `base` は、本番が `/switchbot-logger/`、プレビューが `/switchbot-logger/develop/` です。

## ワークフロー

1. `.github/workflows/validate-develop.yml` は `develop` へのpushと `main`・`develop` 宛PRで `pnpm test` と `pnpm build` を実行します。
2. `.github/workflows/deploy-pages.yml` は `main` へのpush、またはdevelopへのpush検証が成功したときに、**main側のワークフロー**として起動します。
3. Pull Requestの検証結果、失敗・キャンセルした検証結果では公開しません。
4. 公開ジョブは両ブランチをcheckoutし、それぞれの依存インストール・テスト・ビルドを行います。developについては検証成功したコミットSHAを利用します。
5. 本番ビルドを公開ルート、プレビュービルドを `develop/` にまとめて1度だけPagesへデプロイします。

## GitHubの設定

- Settings → Pages → Build and deployment → Sourceを `GitHub Actions` にします。
- Pagesの公開Environmentは `github-pages` の1つだけにします。
- `github-pages` のブランチ保護をmainに制限しても動作するよう、デプロイワークフローはmainに置きます。
- `workflow_run` を使用するため、初回は **`develop` → `main` のPRでワークフローを取り込む必要があります**。developのみに置いたままでは新しいプレビュー公開は開始されません。
- `Validate develop` というワークフロー名を変える場合は、公開ワークフロー側の `workflow_run.workflows` も変更します。
- GitHub ActionsにSwitchBotのAPIトークンを登録する必要はありません。記録はGASで、画面はシートから読み取るだけです。

## セキュリティと運用

- `github-pages` は一般公開です。本番・プレビュー共にデータの秘匿性はありません。
- gvizでスプレッドシートを直接読むため、公開範囲・共有設定と取得対象データを点検してください。
- 画面のpush・Pagesの再デプロイは、GASの5分間隔のログ記録を起動するものではありません。GAS側のトリガーと失敗履歴は別途確認してください。
- `workflow_run` で起動する公開処理は、成功したdevelopのpushを条件にし、外部フォークの結果では起動しません。
- Pagesデプロイは直列処理にし、古い検証ジョブのみキャンセルします。
