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
	// requestSendは要求IDの予約順と実送信順を一致させ、順番待ちも中断可能にする。
	requestSend chan struct{}
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
	return &Synthesizer{baseClient: base, results: results, requests: requests, requestSend: make(chan struct{}, 1)}, nil
}

// SendResult はProcessorResult.Rawを再検証し、変更せず同期送信する。
// 空でないだけでは有効な要求と判断できないため、復号結果と入力の両方でセッションの一致を確認する。
// 未完了要求が8件なら完了受信を待ち、呼出元の取消と接続終了で順番待ち・枠待ちを解除する。
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
	c.mu.Lock()
	state := c.state
	lifetime := c.lifetimeCtx
	c.mu.Unlock()
	if state == stateClosed {
		return ErrClosed
	}
	if state != stateOpen {
		return ErrNotConnected
	}
	select {
	case c.requestSend <- struct{}{}:
		defer func() { <-c.requestSend }()
	case <-ctx.Done():
		return ctx.Err()
	case <-lifetime.Done():
		return ErrClosed
	}
	if err := c.requests.add(ctx, lifetime.Done(), decoded.ResponseMessage.SpeechID); err != nil {
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
// changedは枠待ちが必要になったときに作り、検証済みの完了受信で閉じる。
type synthesisRequests struct {
	mu       sync.Mutex
	sent     int64
	pending  []int64
	sequence protocol.ChunkSequence
	changed  chan struct{}
}

// add は接続と呼出元が有効な間だけ要求を予約し、満杯なら受信処理へロックを返して待つ。
// 予約前の中断は連番を消費せず、完了による通知と待機開始の競合も同じロックで防ぐ。
func (r *synthesisRequests) add(ctx context.Context, closed <-chan struct{}, speechID int64) error {
	for {
		r.mu.Lock()
		if err := ctx.Err(); err != nil {
			r.mu.Unlock()
			return err
		}
		select {
		case <-closed:
			r.mu.Unlock()
			return ErrClosed
		default:
		}
		if len(r.pending) < 8 {
			r.sent++
			r.pending = append(r.pending, speechID)
			r.mu.Unlock()
			return nil
		}
		if r.changed == nil {
			r.changed = make(chan struct{})
		}
		changed := r.changed
		r.mu.Unlock()
		select {
		case <-changed:
		case <-ctx.Done():
			return ctx.Err()
		case <-closed:
			return ErrClosed
		}
	}
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
		if r.changed != nil {
			close(r.changed)
			r.changed = nil
		}
	}
	return value, nil
}
