# レビュー: task-260823061841-pion-phase-6-python-rtc-removal

## 判定

APPROVED

## 理由・申し送り

- Gate 5はPASS済みであり、通常`full` / `rtc`は既にPion `sincro-rtc`だけを起動する。Python RTC stack、aiortc診断profile、専用Consul agentと依存を削除して二重保守を終える根拠がある。
- stable service名、TCP 8001、固定media UDP、signaling / DataChannel / MessagePack契約を維持し、Pion実行経路の改名と旧経路の削除に限定している。aiortcの動作確認、browser smoke、性能・負荷・soak、新規toolを要求せず、VPSでのrebuild / readiness / Consul登録 / active session 0を確認する最小の高リスク確認になっている。
- Go module、Docker build context、Python互換test、Frontend test fixture import、compose、current designに`pion-poc`またはaiortcの参照がある。canonical renameと削除に伴う同期先が実在し、`go test ./...`、Python lock / lint、compose config、全体gate、VPS再deployで完了条件を検証できる。
- 本番Goコードの名前・module path・build entrypointを変更するため、実装時は変更シンボルと直接理解範囲へ`documents/rules/source-comments.md`を直接適用する。コメント監査表をtaskへ追加しない。

## 自律補完

- `AUTO_FIX` canonical renameに伴い、Goのinternal importとmodule declaration、Dockerfileのworkdir / COPY / binary名、`sincro-models`のGo互換test、Frontend testのfixture importを同じ機械的renameで更新する。通信契約やFrontend挙動は変えない。
- `AUTO_FIX` current designと移行文書の`pion-poc` path、aiortc診断profile、削除する`audio-broker.md`への通常導線を更新または除去する。移行経緯として残すaiortc / AudioBroker記述は過去形の記録として保持し、存在しない現行文書へのリンクは残さない。
- `AUTO_FIX` root `pyproject.toml`の`full` / `sincro-rtc` dependency group、workspace member、source、ty excludeと、下流imageのPython workspace metadata copyを旧`sincro-rtc` package削除に合わせて整理し、`uv.lock`を再生成する。Pionが使う共有設定・model・下流service依存は維持する。
