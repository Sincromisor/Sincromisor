package report

import (
	"encoding/json"
	"time"
)

// Status は一つの Gate 3 scenario の観測判定である。
type Status string

const (
	// StatusPass は scenario の全条件を観測して満たした判定である。
	StatusPass Status = "PASS"
	// StatusFail は scenario を観測し製品または harness の条件違反を確定した判定である。
	StatusFail Status = "FAIL"
	// StatusNotObserved は環境または前段失敗で scenario の判定材料を得られなかった状態である。
	StatusNotObserved Status = "NOT_OBSERVED"
)

// FailureClass は scenario 自体の失敗原因を有限分類する。
type FailureClass string

const (
	// FailureNone は PASS scenario だけが使う無失敗分類である。
	FailureNone FailureClass = "NONE"
	// FailureHarness は検証基盤自身の失敗を表す。
	FailureHarness FailureClass = "HARNESS"
	// FailureProduct は対象 Pion の契約違反を表す。
	FailureProduct FailureClass = "PRODUCT"
	// FailureEnvironment は外部 tool や実行環境の不備を表す。
	FailureEnvironment FailureClass = "ENVIRONMENT"
)

// CleanupStatus は scenario 判定から独立した後始末の結果である。
type CleanupStatus string

const (
	// CleanupPass は全所有 resource の終了と join が完了した状態である。
	CleanupPass CleanupStatus = "PASS"
	// CleanupFail は後始末 error が残った状態である。
	CleanupFail CleanupStatus = "FAIL"
)

// Input は事前検査済み入力の解決済み path、version、任意の content digestである。
type Input struct {
	Name    string  `json:"name"`
	Path    string  `json:"path"`
	Version string  `json:"version"`
	SHA256  *string `json:"sha256"`
}

// Cleanup は元の scenario 判定を上書きしない独立した cleanup 結果である。
type Cleanup struct {
	Status CleanupStatus `json:"status"`
	Error  *string       `json:"error"`
}

// Scenario は一つの有限 ID に対する観測、判定、cleanup を保持する。
//
// Observations の duration と count を表す field は整数で記録する。
type Scenario struct {
	ID           string         `json:"id"`
	Status       Status         `json:"status"`
	StartedAt    time.Time      `json:"started_at"`
	EndedAt      time.Time      `json:"ended_at"`
	FailureClass FailureClass   `json:"failure_class"`
	Observations map[string]any `json:"observations"`
	Cleanup      Cleanup        `json:"cleanup"`
}

// Document は schema version 1 の Gate 3 成果物全体である。
type Document struct {
	SchemaVersion int        `json:"schema_version"`
	Commit        string     `json:"commit"`
	Inputs        []Input    `json:"inputs"`
	Scenarios     []Scenario `json:"scenarios"`
}

func marshalDocument(document Document) ([]byte, error) {
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}
