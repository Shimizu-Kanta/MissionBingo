# ミッションビンゴ

ミッションを達成してマスを開けるオンライン対戦ビンゴ（身内向け）。
仕様は `docs/spec.md`、実装の順番と完了条件は `docs/plan.md` を参照すること。

## 技術スタック

- フロント：Vite + React + TypeScript（`@cloudflare/vite-plugin` で Worker と同居）
- API：Hono（Cloudflare Workers）
- リアルタイム・ゲーム状態：Durable Objects（SQLite バックエンド、1ルーム = 1 `RoomDO`）
- 画像：Cloudflare R2（ゲーム終了から24時間後に RoomDO のアラームで削除。保険としてライフサイクルルールでアップロードから7日後に削除）
- 運用は Cloudflare 無料プランの範囲に収める前提

## ディレクトリ構成

```
src/
├─ client/        # React（画面）
├─ worker/
│  ├─ index.ts    # Hono：ルーム作成API、WebSocket を RoomDO へ振り分け
│  └─ room.ts     # RoomDO：状態・申請・承認・取り消し・終了
└─ shared/
   └─ types.ts    # クライアントと RoomDO 共通の型（WebSocket メッセージ含む）
docs/
├─ spec.md        # 仕様書（何を作るか）
└─ plan.md        # 実装計画（どの順で作るか）
```

## コマンド

- `npm run dev`：ローカル開発（Vite + Workers ランタイム）
- `npm run build`：ビルド
- `npm run deploy`：`wrangler deploy` で本番反映
- `npx wrangler types`：バインディングの型を再生成（wrangler.jsonc を変えたら実行）

## 設計の原則

- ゲーム状態を変える処理はすべて `RoomDO` の中で行う。クライアントは「操作の要求」を送るだけで、結果は RoomDO からのブロードキャストで受け取る（サーバーが正）。
- 操作ごとに RoomDO 側で権限と状態を検証する。例：GM 以外の取り消しは拒否、終了済みルームへの申請・取り消しは拒否。UI で隠すだけにしない。
- WebSocket は Hibernation API（`ctx.acceptWebSocket`）を使い、無料枠の消費を抑える。
- WebSocket メッセージは `shared/types.ts` に `type` フィールドで判別する union 型として定義し、受信側で必ずバリデーションする。
- 抽選はルーム作成時に1回だけ行い、結果（またはシード）を RoomDO に保存する。個別カードでも全チーム同じ並び。
- ログインはなし。ルームコード＋端末ごとのトークン（localStorage）で参加者を識別する。

## コーディング規約

- TypeScript は strict。`any` は使わない。
- UI の文言は日本語。
- 1つの変更は plan.md の1ステップに収める。終わったら完了条件を満たしているか確認してから報告する。

## 進め方

- 作業は `docs/plan.md` のステップ順に進める。指示されたステップ以外に手を広げない。
- 仕様にない判断が必要になったら、勝手に決めずに確認する。`docs/spec.md` の「未決事項」に関わる部分は特に。
- `docs/spec.md` は指示がない限り編集しない。
