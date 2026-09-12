# infrastructure タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 17 件）

### done（完了） — 17 件

| タスク                                                                                                               | タイトル                                             | 判定    | 依存                                               |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- | -------------------------------------------------- |
| [task-260801224216-fix-service-initializer-uv-tool](./task-260801224216-fix-service-initializer-uv-tool/task.md)     | service-initializer の uv 初期化依存を解消する       | ✅ PASS | —                                                  |
| [task-260905145218-local-startup-prerequisites](./task-260905145218-local-startup-prerequisites/task.md)             | ローカル起動手順と会話モードの前提を同期             | ✅ PASS | —                                                  |
| [task-260906104817-consul-long-offline-restart](./task-260906104817-consul-long-offline-restart/task.md)             | Consulの長期停止後の起動拒否を防ぐ                   | ✅ PASS | —                                                  |
| [task-260906233317-align-nemo-cuda-image](./task-260906233317-align-nemo-cuda-image/task.md)                         | NeMoコンテナのCUDA基盤を現在の依存構成に合わせる     | ✅ PASS | —                                                  |
| [task-260906233317-lock-container-dependency-install](./task-260906233317-lock-container-dependency-install/task.md) | コンテナの依存導入をロックファイルに従わせる         | ✅ PASS | —                                                  |
| [task-260906233317-update-rtc-go-image](./task-260906233317-update-rtc-go-image/task.md)                             | RTCのGoビルド基盤を1.26系の修正版へ更新する          | ✅ PASS | —                                                  |
| [task-260906233317-update-voicevox-engine-image](./task-260906233317-update-voicevox-engine-image/task.md)           | VOICEVOXを0.25.2へ更新し配布物の取得処理を修正する   | ✅ PASS | —                                                  |
| [task-260906233350-remove-retired-nue-container-path](./task-260906233350-remove-retired-nue-container-path/task.md) | 廃止済みNueのコンテナ選択導線を整理する              | ✅ PASS | —                                                  |
| [task-260907011014-publish-ghcr-images](./task-260907011014-publish-ghcr-images/task.md)                             | GHCRの月次公開と旧構成イメージの整理を定型化する     | ✅ PASS | —                                                  |
| [task-260907221335-compose-default-profile](./task-260907221335-compose-default-profile/task.md)                     | 通常起動のプロファイル指定を環境設定へ移す           | ✅ PASS | —                                                  |
| [task-260907221335-frontend-consul-registration](./task-260907221335-frontend-consul-registration/task.md)           | フロント再起動時のConsul登録消失を修正する           | ✅ PASS | —                                                  |
| [task-260907221335-monthly-image-rollout](./task-260907221335-monthly-image-rollout/task.md)                         | 月次イメージ更新に各ホストへの反映と起動確認を含める | ✅ PASS | —                                                  |
| [task-260907221335-nemo-model-preparation](./task-260907221335-nemo-model-preparation/task.md)                       | 共通初期化をNeMoモデル準備へ整理する                 | ✅ PASS | —                                                  |
| [task-260907221335-rtc-host-consul-agent](./task-260907221335-rtc-host-consul-agent/task.md)                         | VPS上のRTCを同一ホストのConsulエージェントへ接続する | ✅ PASS | —                                                  |
| [task-260913011124-setup-wsl-devenv](./task-260913011124-setup-wsl-devenv/task.md)                                   | WSL2向け開発環境の導入スクリプトを用意する           | ✅ PASS | —                                                  |
| [task-260913012528-prepare-python314-dependencies](./task-260913012528-prepare-python314-dependencies/task.md)       | Python 3.14移行に必要な音声処理依存を更新する        | ✅ PASS | —                                                  |
| [task-260913012528-upgrade-python314](./task-260913012528-upgrade-python314/task.md)                                 | Python実行環境を3.14へ切り替える                     | ✅ PASS | `task-260913012528-prepare-python314-dependencies` |

<!-- AUTOGEN:tasks END -->
