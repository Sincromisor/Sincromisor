// Package pipelinecontract は Gate 3 harness が使う4つの Python audio pipeline 契約を
// 決定的な WebSocket service として実装する。
//
// repository 所有の互換 fixture に対して MessagePack を検証し、service 間の identity と履歴の流れを
// 記録する。harness 自己検証用の double であり、この service の成功は実 Python service の
// Gate 3 合格を証明しない。
package pipelinecontract
