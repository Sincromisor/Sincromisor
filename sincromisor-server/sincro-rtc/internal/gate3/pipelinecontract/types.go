package pipelinecontract

import (
	"errors"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

var (
	// ErrProtocol は不正な設定、MessagePack、操作順を分類する。
	ErrProtocol = errors.New("pipeline contract protocol violation")
	// ErrIdentity は session、speech、sequence identity の不一致を分類する。
	ErrIdentity = errors.New("pipeline contract identity mismatch")
)

// Config は commit 済み fixture directory と listener interface を指定する。
//
// FixturesDir は6つの pipeline protocol fixture を含む。ListenHost は port なしの host で、
// Gate 3 では外部公開を避けるため 127.0.0.1 を使う。
type Config struct {
	// FixturesDir は protocol/testdata の絶対 path である。
	FixturesDir string
	// ListenHost は外部公開しない loopback IP address である。
	ListenHost string
}

// Entry は完了した service 操作1件を wire 順で表す。
//
// payload は意図的に保持せず、有限な identity / 履歴 metadata と
// processor から synthesizer までの byte 一致結果だけを残す。
type Entry struct {
	// Ordinal は Set 全体で1から始まる wire 操作順である。
	Ordinal int
	// Service はこの操作を受理して response を生成した境界である。
	Service discovery.Service
	// SessionID は generation を跨いで維持される pipeline session である。
	SessionID string
	// SpeechID は Extractor attempt が割り当て、下流が変更せず引き継ぐ。
	SpeechID int64
	// SequenceID は Extractor attempt が割り当てる service 間順序 ID である。
	SequenceID int64
	// HistoryLength は Processor request に含まれた確定済み履歴件数である。
	HistoryLength int
	// FinalHistorySize は Processor final response の確定済み履歴件数である。
	FinalHistorySize int
	// ByteIdentical は Synthesizer request が Processor response と byte 単位で一致したことを表す。
	ByteIdentical bool
}

// Transcript は Set が観測した操作の immutable snapshot である。
type Transcript struct {
	// Entries は payload を含まず、受理順を保持する防御的 copy である。
	Entries []Entry
}
