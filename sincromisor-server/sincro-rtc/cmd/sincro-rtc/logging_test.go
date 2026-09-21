package main

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestJSONLogKeepsDiagnosticFields(t *testing.T) {
	var output bytes.Buffer
	newJSONLogger(&output).Error("日本語\n障害", "session_id", "session-a", "stage", "pipeline", "reason", "closed")
	if bytes.Count(output.Bytes(), []byte("\n")) != 1 {
		t.Fatal("log event must occupy one physical line")
	}
	var event map[string]any
	if err := json.Unmarshal(output.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	for key, expected := range map[string]string{"message": "日本語\n障害", "level": "error", "session_id": "session-a", "stage": "pipeline", "reason": "closed"} {
		if event[key] != expected {
			t.Fatalf("%s = %v", key, event[key])
		}
	}
	if event["timestamp"] == nil {
		t.Fatal("missing timestamp")
	}
}
