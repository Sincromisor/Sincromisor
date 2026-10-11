// Package pipelinecontract はRTC統合試験で使う、下流4サービスの契約を模擬するWebSocketサーバーを提供する。
//
// リポジトリ内の互換性確認用データに対してMessagePackを検証し、サービス間の識別子と履歴の流れを記録する。
// 固定データを返す試験用の実装であり、実際のPythonサービスの動作や認識・合成品質は検証しない。
package pipelinecontract
