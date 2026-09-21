package main

import (
	"io"
	"log/slog"
	"strings"
)

// newJSONLogger は起動前後で同じJSONL書式を使い、診断属性を共通項目へ対応付ける。
func newJSONLogger(output io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(output, &slog.HandlerOptions{
		Level: slog.LevelInfo,
		ReplaceAttr: func(groups []string, attr slog.Attr) slog.Attr {
			if len(groups) == 0 {
				switch attr.Key {
				case slog.TimeKey:
					attr.Key = "timestamp"
					attr.Value = slog.TimeValue(attr.Value.Time().UTC())
				case slog.MessageKey:
					attr.Key = "message"
				case slog.LevelKey:
					attr.Value = slog.StringValue(strings.ToLower(attr.Value.String()))
				}
			}
			return attr
		},
	})).With("event", "log")
}
