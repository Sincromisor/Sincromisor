package client

import (
	"context"
	"errors"
	"log/slog"
	"sync"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const synthesizerReadLimit int64 = 32 << 20

// Synthesizer は文章処理の元MessagePackデータを合成音声へ変換する接続を所有する。
// Rawを再符号化せず転送してPython側のqueryを保つ。PCM区間の順序と要求を照合し、再生はRTC側が担当する。
type Synthesizer struct {
	*baseClient
	results  chan protocol.SynthesizerChunk
	requests *synthesisRequests
	// requestSendMuは要求IDの予約順と実送信順を一致させる。requests.muはI/O中に保持しない。
	requestSendMu sync.Mutex
}

// NewSynthesizer は設定と依存を検証し、通信前の接続を作る。
// 接続先のパスと32 MiBの上限は通信契約として固定する。
func NewSynthesizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Synthesizer, error) {
	results := make(chan protocol.SynthesizerChunk)
	requests := &synthesisRequests{}
	base, err := newBase(
		cfg, ServiceSynthesizer, discovery.ServiceSynthesizer, resolver, logger,
		"/api/v1/VoiceSynthesizer/synthesize", nil, synthesizerReadLimit,
		func() { close(results) },
		decodeResults(results, requests.decode),
	)
	if err != nil {
		return nil, err
	}
	return &Synthesizer{baseClient: base, results: results, requests: requests}, nil
}

// SendResult はProcessorResult.Rawを再検証し、変更せず同期送信する。
// 空でないだけでは有効な要求と判断できないため、復号結果と入力の両方でセッションの一致を確認する。
// 不正な値は通信前に拒否し、入力は呼び出し中だけ参照する。
func (c *Synthesizer) SendResult(ctx context.Context, value protocol.ProcessorResult) error {
	if len(value.Raw) == 0 {
		return errors.New("synthesizer processor result Raw must not be empty")
	}
	decoded, err := protocol.DecodeProcessorResult(value.Raw)
	if err != nil {
		return errors.New("synthesizer processor result Raw was not successfully decoded")
	}
	if decoded.VoiceText == nil || *decoded.VoiceText == "" {
		return errors.New("synthesizer voice text must not be empty")
	}
	if decoded.SessionID != c.cfg.SessionID || value.SessionID != decoded.SessionID {
		return errors.New("synthesizer processor result session ID does not match client")
	}
	c.requestSendMu.Lock()
	defer c.requestSendMu.Unlock()
	c.mu.Lock()
	state := c.state
	c.mu.Unlock()
	if state == stateClosed {
		return ErrClosed
	}
	if state != stateOpen {
		return ErrNotConnected
	}
	if err := c.requests.add(decoded.ResponseMessage.SpeechID); err != nil {
		return err
	}
	return c.send(ctx, value.Raw)
}

// Results は接続が所有する合成音声結果のチャネルを返す。配送は受け手を待ち、受信処理の終了後に閉じる。
func (c *Synthesizer) Results() <-chan protocol.SynthesizerChunk {
	return c.results
}

// synthesisRequests は受信と送信の間で要求ID・発話IDの照合表を共有する。
// 完了通知だけが要求を解放し、最大8要求で未完了の本文増分が無制限に積まれることを防ぐ。
type synthesisRequests struct {
	mu       sync.Mutex
	sent     int64
	pending  []int64
	sequence protocol.ChunkSequence
}

func (r *synthesisRequests) add(speechID int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.pending) >= 8 {
		return errors.New("synthesis pending request limit exceeded")
	}
	r.sent++
	r.pending = append(r.pending, speechID)
	return nil
}

// decode は送信済み要求との一致を確認してから、区間順序の期待値を進める。
// 接続切断はbaseClientが終端イベントへ変換するため、未完了要求が成功へ化ける経路はない。
func (r *synthesisRequests) decode(payload []byte) (protocol.SynthesizerChunk, error) {
	value, err := protocol.DecodeSynthesizerChunk(payload)
	if err != nil {
		return value, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	expected := r.sent - int64(len(r.pending)) + 1
	if len(r.pending) == 0 || value.RequestID != expected || value.SpeechID != r.pending[0] {
		return value, errors.New("synthesis chunk has no matching request")
	}
	if err := r.sequence.Accept(value); err != nil {
		return value, err
	}
	if value.Final {
		r.pending = r.pending[1:]
	}
	return value, nil
}
