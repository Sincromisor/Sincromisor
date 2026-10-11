// Package playback は配布素材を一度だけ検証・復号し、RTC sessionへ共有する。
package playback

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
// 初回の失敗は保持しないため、素材を修正してから次のOfferで再試行できる。mutexで共有処理の開始と結果を管理し、
// 同じ素材へ並行接続した各セッションが別々のFFmpegを起動しないようにする。
type Loader struct {
	directory string
	decoder   decoder
	mu        sync.Mutex
	loaded    *Material
	loading   *loadFlight
}

// loadFlightの結果はdoneを閉じる前に確定する。失敗は同時待機者へだけ返し、次の要求は再試行できる。
type loadFlight struct {
	done     chan struct{}
	material Material
	err      error
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

// Load は初回だけ共有処理を開始する。どの呼出元も自身の中断で待機を終えられるが、
// 他の接続が使う読み込みは中断しない。共有処理は復号期限内に結果を確定して終了する。
func (l *Loader) Load(ctx context.Context) (Material, error) {
	if ctx == nil {
		return Material{}, fmt.Errorf("%w: nil context", ErrUnavailable)
	}
	if err := ctx.Err(); err != nil {
		return Material{}, err
	}
	l.mu.Lock()
	if l.loaded != nil {
		material := *l.loaded
		l.mu.Unlock()
		return material, nil
	}
	if l.loading == nil {
		l.loading = &loadFlight{done: make(chan struct{})}
		go l.load(l.loading)
	}
	flight := l.loading
	l.mu.Unlock()
	select {
	case <-ctx.Done():
		return Material{}, ctx.Err()
	case <-flight.done:
		return flight.material, flight.err
	}
}

// loadは共有結果を一度だけ公開する。失敗時も全待機者を起こし、部分素材は保持しない。
func (l *Loader) load(flight *loadFlight) {
	flight.material, flight.err = l.loadIndependent()
	l.mu.Lock()
	defer l.mu.Unlock()
	if flight.err == nil {
		l.loaded = &flight.material
	}
	l.loading = nil
	close(flight.done)
}

// loadIndependent は接続要求の期限と独立した有限deadlineで共有素材を復号する。
// 1つのOffer中断で全sessionの共有読み込みを殺さず、失敗は保持しないため次Offerで再試行できる。
func (l *Loader) loadIndependent() (Material, error) {
	voice, err := readMaterialFile(filepath.Join(l.directory, "voice.opus"))
	if err != nil {
		return Material{}, fmt.Errorf("%w: read voice", ErrUnavailable)
	}
	// Oggの先頭パケットを確認し、MIMEだけOpusと偽ったVorbis素材も拒否する。
	if !isOggOpus(voice) {
		return Material{}, fmt.Errorf("%w: expected Ogg Opus", ErrUnavailable)
	}
	raw, err := readMaterialFile(filepath.Join(l.directory, "synthesis.json"))
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
		Message: record.Message, MoraQueue: record.MoraQueue, SpeakingTime: *record.SpeakingTime,
		Voice: voice, AudioFormat: record.AudioFormat,
	})
	if err != nil {
		return Material{}, fmt.Errorf("%w: decode synthesis: %w", ErrUnavailable, err)
	}
	return Material{Message: record.Message, Speech: decoded}, nil
}

type synthesisRecord struct {
	Message      string                     `json:"message"`
	Query        json.RawMessage            `json:"query"`
	MoraQueue    []protocol.SynthesizerMora `json:"mora_queue"`
	SpeakingTime *float64                   `json:"speaking_time"`
	AudioFormat  string                     `json:"audio_format"`
}

// validは素材の必須項目だけを検査する。クエリの解釈は合成側、モーラとPCMの整合はDecoderが所有する。
func (r synthesisRecord) valid() bool {
	var query map[string]json.RawMessage
	if len(r.Query) == 0 || json.Unmarshal(r.Query, &query) != nil || len(query) == 0 ||
		r.Message == "" || len(r.MoraQueue) == 0 || r.AudioFormat != "audio/ogg;codecs=opus" ||
		r.SpeakingTime == nil || math.IsNaN(*r.SpeakingTime) || math.IsInf(*r.SpeakingTime, 0) || *r.SpeakingTime <= 0 {
		return false
	}
	for _, mora := range r.MoraQueue {
		if math.IsNaN(mora.Length) || math.IsInf(mora.Length, 0) || mora.Length < 0 {
			return false
		}
	}
	return true
}

// readMaterialFileはDecoderと同じ8 MiB以内の通常ファイルだけを読む。特殊ファイル待ちや無制限の確保を防ぐ。
func readMaterialFile(path string) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	const limit = 8 * 1024 * 1024
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, errors.New("invalid material file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if len(data) > limit {
		return nil, errors.New("material file exceeds limit")
	}
	return data, err
}

// isOggOpusは最初のOggページにある識別パケットだけを見る。ページや音声本体の検証はFFmpegへ委ねる。
func isOggOpus(voice []byte) bool {
	if len(voice) < 28 || !bytes.Equal(voice[:4], []byte("OggS")) || voice[26] == 0 {
		return false
	}
	start := 27 + int(voice[26])
	return len(voice) >= start+8 && bytes.Equal(voice[start:start+8], []byte("OpusHead"))
}
