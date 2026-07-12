# Capture production sincro motion replay baselines

## 背景 / 目的

roadmap は replay / metrics なしの品質改善を採用しない方針を示している。現状の本番 `sincro` は旧 `poseSnapshot -> SincroPoseRetargeter -> direct bone write` 経路なので、composer 組み込み前に現行挙動の baseline を固定しておく必要がある。

本タスクでは、既存 `motion-debug` の recording / replay / metrics を使い、後続の observe-only / composer dry-run / 実適用の比較対象になる baseline artifact を作る。

## 完了条件（受け入れ条件）

- [ ] `artifacts/production-sincro-baseline-manifest.md` を作成し、baseline fixture id、取得手順、使用 VRM、camera / video source、設定値、metrics summary の保存場所を記録する。
- [ ] P0 motion として `neutral-10s`、`left-arm-raise-slow`、`both-arms-raise-slow`、`arm-dropout-return`、`arms-cross`、`fast-wave` の 6 件を baseline 対象にする。
- [ ] 各 fixture について、取得できた場合は replay log と metrics summary の path、取得できなかった場合は理由、再取得条件、代替 synthetic log の有無を manifest に記録する。
- [ ] baseline は本番 `simple-vrm` / `sincro` の現行設定を対象にし、composer dry-run や new pipeline observe-only を有効にしない。
- [ ] raw camera device id / group id / label は artifact に保存しない。必要な場合も scrub 済み設定のみ保存する。
- [ ] production TypeScript code は変更しない。必要な操作面が不足している場合は本タスクで実装せず、follow-up として記録する。

## 設計判断（着手前に確定済み）

- baseline 正本は task artifact に置く。設計文書には baseline の存在と使い方だけを残し、個別ログの大きな JSON / NDJSON は設計本文へ入れない。
- 実カメラで取得できない環境では、既存 replay / synthetic log を代替として許可する。ただし `source: synthetic` と明記し、実機 baseline と混同しない。
- metrics の pass / warn / fail 閾値は既存 `motionMetrics` を正本にし、本タスクで新しい閾値を作らない。

## スコープ境界

- 本タスクでやること: baseline 手順と artifact 作成、可能な範囲で replay log / metrics summary の保存。
- 本タスクでやらないこと: motion pipeline 改修、composer 接続、metrics 閾値変更、実動画 fixture asset の追加。
- 後続タスクとの境界: composer comparison task はこの baseline を入力として旧経路と composer dry-run を比較する。

## 実装方針（既存コード整合: file:line）

- `motion-debug` は recording / replay / metrics layer を持つ developer page として設計されている（`documents/design/frontend/character/motion.md:141`、`documents/design/frontend/character/motion.md:143`、`documents/design/frontend/character/motion.md:140`）。
- roadmap の Phase 1 は P0 固定テストモーションと metrics summary を regression fixture として保存することを求めている（`documents/research/character_animation/roadmap.md:300`、`documents/research/character_animation/roadmap.md:305`）。
- `MotionDebugRecorder` / metrics は `src/character/motionEvaluation` と `src/pages/motionDebug` に実装済みである（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:92`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts`）。

## テスト

- `npm run tasks:check`
- `npm run tasks:index:check`
- 可能な場合: `cd sincromisor-frontend && npm run test -- motionQaRegression`
- 実機 recording ができない場合は、未実行理由と代替 artifact を `impl.md` に記録する。

## ドキュメント同期の要否

要。baseline の取得・利用は後続タスクの前提になるため、`documents/design/frontend/character/motion.md` の motion-debug / metrics 節に baseline artifact の使い方を短く同期する。公開 API / WebRTC 契約は変えない。
