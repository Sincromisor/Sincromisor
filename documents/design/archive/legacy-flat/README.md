# Legacy Flat Design Documents

このディレクトリは、2026-05-17 の設計ドキュメント再編前に `documents/design/` 直下へ置かれていた文書の退避先である。

通常の設計更新では、このディレクトリを更新しない。現在有効な設計は `documents/design/index.md` から辿れる current design、contract、decision、initiative のいずれかを更新する。

## 移行先の目安

| 旧文書                                                | 主な移行先                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `frontend_ui.md`                                      | `frontend/app-shell.md`, `frontend/settings-and-debug-ui.md`                                       |
| `frontend_migration_react.md`                         | `initiatives/react-migration.md`, `decisions/ADR-260222-react-migration.md`                        |
| `frontend_character.md`                               | `frontend/character/overview.md`, `frontend/character/motion.md`, `frontend/character/tracking.md` |
| `frontend_vad.md`                                     | `frontend/audio/vad.md`                                                                            |
| `networking_rtc.md`                                   | `contracts/frontend-rtc.md`                                                                        |
| `networking_websocket.md`                             | `contracts/audio-pipeline-websocket.md`                                                            |
| `backend_*.md`                                        | `backend/services/`                                                                                |
| `backend_speech_recognizer_proper_noun_dictionary.md` | `contracts/proper-noun-dictionary.md`                                                              |
| `backend_speech_recognizer_proper_noun_biasing.md`    | `initiatives/proper-noun-biasing.md`, `decisions/ADR-260412-proper-noun-biasing.md`                |
| `service_compose.md`                                  | `infrastructure/compose.md`                                                                        |
| `service_consul.md`                                   | `infrastructure/consul.md`                                                                         |
| `backend_storage.md`                                  | `infrastructure/storage.md`                                                                        |
