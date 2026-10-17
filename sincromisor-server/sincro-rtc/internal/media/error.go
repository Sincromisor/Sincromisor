// Package media は音声入出力からSessionへ渡す、内容を含まない操作情報を定義する。
package media

// OperationError は既存のエラー連鎖を保ち、失敗した操作と取得済み発話IDを添える。
// Errの文字列表現は診断ログへ出さず、Sessionが型と既知原因だけを選別する。
type OperationError struct {
	Operation string
	Err       error
	SpeechID  *int64 // 無音・入力など、発話を保持しない境界ではnil。
}

// Error は既存の呼出元向け表現を維持する。ログの属性としては使用しない。
func (e *OperationError) Error() string { return e.Err.Error() }

// Unwrap はEOF・取消など既存のerrors.Is判定を維持する。
func (e *OperationError) Unwrap() error { return e.Err }
