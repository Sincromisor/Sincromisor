# Pionでlegacy initial Offerを互換受理する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Phase 4 リハーサルで、既存 staging frontend が送る initial Offer
`{sdp,type,talk_mode}` を Pion が `Invalid initial offer identity.` として HTTP 400
で拒否した。配信済み frontend を再ビルドせずに aiortc から Pion へ切り替えられるよう、
Pion の initial Offer 境界で旧形式を互換受理する。

現在の frontend source が送る `offer_request_id` / `offer_revision: 1` を含む形式と、
update Offer / candidate の厳格な session・revision 契約は維持する。正本は
`documents/design/contracts/frontend-rtc.md` とする。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] `session_id` を持たない `{sdp,type:"offer",talk_mode}` が Pion で initial session を作成し、
      HTTP 200 の Answer に `session_id` と `offer_revision: 1` を返す。
- [ ] identity 付き initial Offer の同一 request ID retry、identity 不正、update Offer、candidate の
      現行検証・冪等性を壊さない。
- [ ] `go test ./...` と `npm run gate` が成功する。
- [ ] `frontend-rtc.md` に legacy initial Offer の受理範囲、Pion が生成する identity と
      retry の制限を明記する。

## 設計判断

identity を省略した initial Offer は、Pion が request ごとに UUID と revision 1 を補完する。
この旧形式には client request ID がないため、HTTP retry の同一 Answer 保証は提供しない。
`session_id` がある update Offer と、identity が一部だけ欠ける / 不正な初回 Offer は
従来どおり HTTP 400 とする。

## スコープ境界

対象は `sincro-rtc-pion-poc` の HTTP initial Offer parser、関連テスト、WebRTC 契約文書のみ。
frontend の再ビルド・配信、compose / VPS 構成、cutover リハーサルの合否判定は対象外。

## 実装方針

`internal/signaling/http.go` の initial Offer 検証に、既存の UUID validation と registry を再利用する
最小の legacy 分岐を置く。HTTP handler の table-driven test で旧形式成功と部分欠損拒否を追加し、
既存 integration test で Answer identity を確認する。

## テスト

- `go test ./...`（Pion workspace）
- `npm run gate`

## ドキュメント同期の要否

必要。`documents/design/contracts/frontend-rtc.md` の Offer Request と retry 規則を同期する。
