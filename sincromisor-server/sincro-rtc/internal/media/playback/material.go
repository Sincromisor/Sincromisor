// Package playback は配布素材を一度だけ検証・復号し、RTC sessionへ共有する。
package playback

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// ErrUnavailable は既定素材を再生開始に使えないことを表す。
//
// 読み込み・JSON・復号・時刻検証の詳細をHTTP境界へ漏らさず、playback利用者へ固定した失敗を返すために使う。
var ErrUnavailable = errors.New("playback material is unavailable")

// Material は検証済みの表示文と48 kHz PCMをまとめる不変の共有素材である。
// SessionはSpeechIDだけを周回ごとに置き換え、PCMとモーラの内容を変更しない。
type Material struct {
	Message string
	Speech  synthdecode.DecodedSpeech
}

// Source は初回利用で既定素材を返す共有読み込み境界である。
type Source interface {
	Load(context.Context) (Material, error)
}

// Loader は成功した既定素材だけをプロセス中で保持する。
//
// 初回の失敗は保持しないため、素材を修正してから次のOfferで再試行できる。mutexは読み込みとFFmpeg復号を
// 直列化して、同じ素材へ並行接続した各sessionが別々のprocessを起動しないようにする。
type Loader struct {
	directory string
	decoder   decoder
	mu        sync.Mutex
	loaded    *Material
	loading   chan struct{}
}

type decoder interface {
	Decode(context.Context, protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error)
}

// NewLoader は既定素材ディレクトリと共有Decoderから遅延読み込み器を作る。
func NewLoader(directory string, decoder decoder) (*Loader, error) {
	if directory == "" || decoder == nil {
		return nil, errors.New("playback loader dependencies must not be nil")
	}
	return &Loader{directory: directory, decoder: decoder}, nil
}

// Load は成功済み素材を返し、初回だけファイルを検証・復号する。
func (l *Loader) Load(ctx context.Context) (Material, error) {
	if ctx == nil {
		return Material{}, fmt.Errorf("%w: nil context", ErrUnavailable)
	}
	for {
		l.mu.Lock()
		if l.loaded != nil {
			material := *l.loaded
			l.mu.Unlock()
			return material, nil
		}
		if l.loading != nil {
			loading := l.loading
			l.mu.Unlock()
			select {
			case <-ctx.Done():
				return Material{}, ctx.Err()
			case <-loading:
				continue
			}
		}
		l.loading = make(chan struct{})
		loading := l.loading
		l.mu.Unlock()
		material, err := l.loadIndependent()
		l.mu.Lock()
		if err == nil {
			l.loaded = &material
		}
		l.loading = nil
		close(loading)
		l.mu.Unlock()
		return material, err
	}
}

// loadIndependent は接続要求の期限と独立した有限deadlineで共有素材を復号する。
// 1つのOffer中断で全sessionの共有読み込みを殺さず、失敗は保持しないため次Offerで再試行できる。
func (l *Loader) loadIndependent() (Material, error) {
	voice, err := os.ReadFile(filepath.Join(l.directory, "voice.opus"))
	if err != nil {
		return Material{}, fmt.Errorf("%w: read voice", ErrUnavailable)
	}
	raw, err := os.ReadFile(filepath.Join(l.directory, "synthesis.json"))
	if err != nil {
		return Material{}, fmt.Errorf("%w: read synthesis", ErrUnavailable)
	}
	var record synthesisRecord
	if err := json.Unmarshal(raw, &record); err != nil || !record.valid() {
		return Material{}, fmt.Errorf("%w: invalid synthesis", ErrUnavailable)
	}
	decodeCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	decoded, err := l.decoder.Decode(decodeCtx, protocol.SynthesizerResult{
		Message: record.Message, MoraQueue: record.MoraQueue, SpeakingTime: record.SpeakingTime,
		Voice: voice, AudioFormat: record.AudioFormat,
	})
	if err != nil {
		return Material{}, fmt.Errorf("%w: decode synthesis", ErrUnavailable)
	}
	return Material{Message: record.Message, Speech: decoded}, nil
}

type synthesisRecord struct {
	Message      string                     `json:"message"`
	Query        json.RawMessage            `json:"query"`
	MoraQueue    []protocol.SynthesizerMora `json:"mora_queue"`
	SpeakingTime float64                    `json:"speaking_time"`
	AudioFormat  string                     `json:"audio_format"`
}

func (r synthesisRecord) valid() bool {
	var query map[string]json.RawMessage
	if len(r.Query) == 0 || json.Unmarshal(r.Query, &query) != nil || query == nil ||
		r.Message == "" || r.MoraQueue == nil || r.AudioFormat != "audio/ogg;codecs=opus" ||
		math.IsNaN(r.SpeakingTime) || math.IsInf(r.SpeakingTime, 0) || r.SpeakingTime < 0 {
		return false
	}
	for _, mora := range r.MoraQueue {
		if math.IsNaN(mora.Length) || math.IsInf(mora.Length, 0) || mora.Length < 0 {
			return false
		}
	}
	return true
}
