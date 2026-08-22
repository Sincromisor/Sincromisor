package main

import (
	"context"
	"log/slog"
	"testing"
)

func TestProcessLifecycleLogsUseCanonicalPrivacyFields(t *testing.T) {
	handler := &capturedHandler{}
	logger := slog.New(handler)

	logListenerReady(logger, 17)
	logShutdownRequested(logger)
	logShutdownComplete(logger, 0)

	want := []capturedRecord{
		{
			message: "sincro-rtc listening",
			attrs:   map[string]any{"stage": "listener_ready", "count": int64(17)},
		},
		{
			message: "shutdown signal received",
			attrs:   map[string]any{"reason": "process_shutdown"},
		},
		{
			message: "sincro-rtc stopped",
			attrs:   map[string]any{"stage": "shutdown_complete", "count": int64(0)},
		},
	}
	if len(handler.records) != len(want) {
		t.Fatalf("captured lifecycle records = %d, want %d", len(handler.records), len(want))
	}

	allowed := map[string]struct{}{
		"session_id": {},
		"reason":     {},
		"stage":      {},
		"count":      {},
	}
	for index, record := range handler.records {
		for key := range record.attrs {
			if _, ok := allowed[key]; !ok {
				t.Errorf("record %d application key = %q, want allow-list subset", index, key)
			}
		}
		if record.message != want[index].message {
			t.Errorf("record %d message = %q, want %q", index, record.message, want[index].message)
		}
		if !equalAttrs(record.attrs, want[index].attrs) {
			t.Errorf("record %d attrs = %#v, want %#v", index, record.attrs, want[index].attrs)
		}
	}
}

type capturedRecord struct {
	message string
	attrs   map[string]any
}

type capturedHandler struct {
	records []capturedRecord
}

func (h *capturedHandler) Enabled(context.Context, slog.Level) bool {
	return true
}

func (h *capturedHandler) Handle(_ context.Context, record slog.Record) error {
	attrs := make(map[string]any, record.NumAttrs())
	record.Attrs(func(attr slog.Attr) bool {
		attrs[attr.Key] = attr.Value.Any()
		return true
	})
	h.records = append(h.records, capturedRecord{message: record.Message, attrs: attrs})
	return nil
}

func (h *capturedHandler) WithAttrs([]slog.Attr) slog.Handler {
	return h
}

func (h *capturedHandler) WithGroup(string) slog.Handler {
	return h
}

func equalAttrs(got, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for key, wantValue := range want {
		if got[key] != wantValue {
			return false
		}
	}
	return true
}
