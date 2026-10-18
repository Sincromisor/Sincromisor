package rtc

import (
	"context"
	"io"
	"log/slog"
	"net"
	"os"
	"strconv"
	"testing"
	"time"

	pionopus "github.com/pion/opus"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// TestLiveStreamingSynthesis は実Python/Engineから受けた区間を本番のSession出力へ渡す。
// echo接続で上流の認識/LLMだけを省き、Pion/Opusの実通信で最初の有声音を観測する。
// 通常の単体試験では省略し、隔離した結合確認環境の接続先と要求fixtureを指定して実行する。
func TestLiveStreamingSynthesis(t *testing.T) {
	endpoint := os.Getenv("SINCRO_STREAMING_VERIFY_ENDPOINT")
	requestPath := os.Getenv("SINCRO_STREAMING_VERIFY_REQUEST")
	if endpoint == "" || requestPath == "" {
		t.Skip("実合成の接続先と要求fixtureが未指定")
	}
	host, portText, err := net.SplitHostPort(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.ParseUint(portText, 10, 16)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatal(err)
	}
	request, err := protocol.DecodeProcessorResult(raw)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client, err := pclient.NewSynthesizer(pclient.DefaultConfig(request.SessionID, "chat"),
		liveSynthResolver{host: host, port: uint16(port)}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	manager := newTestManager(t)
	defer manager.CloseAll(testCloseContext(t), "test_teardown")
	browser, input, remoteTracks := newEchoBrowserPeer(t)
	defer browser.Close()
	answer := negotiatePairWithMode(t, manager, browser, "echo")
	session := activeSession(t, manager, answer.SessionID)
	remote := waitEchoRemoteTrack(t, remoteTracks)
	// 長い再生でも入力準備期限で閉じないよう、ブラウザーの音声トラックを無音で開始する。
	if err := input.WriteSample(media.Sample{Data: []byte{0xf8, 0xff, 0xfe}, Duration: outputmedia.FrameDuration}); err != nil {
		t.Fatal(err)
	}
	waitForCondition(t, 3*time.Second, func() bool {
		session.lifecycle.mu.Lock()
		defer session.lifecycle.mu.Unlock()
		return session.lifecycle.audio != nil
	})
	firstAudio := make(chan time.Time, 1)
	readError := make(chan error, 1)
	go observeLiveAudio(remote, firstAudio, readError)
	started := time.Now()
	if err := client.SendResult(ctx, request); err != nil {
		t.Fatal(err)
	}
	var first, terminal time.Time
	var samples int64
	chunks := 0
	for terminal.IsZero() {
		select {
		case chunk, ok := <-client.Results():
			if !ok {
				t.Fatal("合成結果が完了通知前に閉じた")
			}
			if err := session.handleSynthChunkOutput(pipeline.Output[protocol.SynthesizerChunk]{Generation: 1, Value: chunk}); err != nil {
				t.Fatalf("output request=%d sequence=%d offset=%d: %v", chunk.RequestID, chunk.Sequence, chunk.SampleOffset, err)
			}
			if err := session.ctx.Err(); err != nil {
				t.Fatalf("RTC session closed during synthesis: %v", err)
			}
			chunks++
			samples += int64(len(chunk.PCM) / 2)
			if chunk.Final {
				terminal = time.Now()
			}
		case at := <-firstAudio:
			first = at
		case err := <-readError:
			t.Fatalf("音声受信: %v", err)
		case event, ok := <-client.Events():
			if ok {
				t.Fatalf("合成接続: %s: %v", event.Kind, event.Err)
			}
			t.Fatal("合成接続が終了した")
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	if first.IsZero() {
		select {
		case first = <-firstAudio:
		default:
			t.Fatal("合成完了前に有声音を受信できなかった")
		}
	}
	if !first.Before(terminal) {
		t.Fatal("有声音の受信が合成完了通知より遅い")
	}
	waitForCondition(t, 2*time.Second, func() bool { return session.output.Stats().QueuedSpeeches == 0 })
	if session.ctx.Err() != nil || session.output.Stats().SpeechAborted != 0 {
		t.Fatal("末尾の再生までにセッションまたは音声が中断した")
	}
	// HTTP EOFとの比較はPythonログの受信完了時刻と同じホスト時計で行う。
	// このテスト単独では、キャッシュ保存前のHTTP EOFを観測したとは扱わない。
	t.Logf("STREAMING_LIVE first_audio_unix_ns=%d terminal_unix_ns=%d first_audio_ms=%d terminal_ms=%d chunks=%d samples=%d", first.UnixNano(), terminal.UnixNano(), first.Sub(started).Milliseconds(), terminal.Sub(started).Milliseconds(), chunks, samples)
}

type liveSynthResolver struct {
	host string
	port uint16
}

func (r liveSynthResolver) Resolve(context.Context, discovery.Service) (discovery.Endpoint, error) {
	return discovery.Endpoint{Host: r.host, Port: r.port}, nil
}

// observeLiveAudio は最初の有声音を一度だけ通知し、ブラウザー終了まで後続RTPも読み続ける。
func observeLiveAudio(track *webrtc.TrackRemote, first chan<- time.Time, failures chan<- error) {
	decoder, err := pionopus.NewDecoderWithOutput(outputmedia.SampleRate, 2)
	if err != nil {
		failures <- err
		return
	}
	if err := track.SetReadDeadline(time.Now().Add(90 * time.Second)); err != nil {
		failures <- err
		return
	}
	observed := false
	for {
		packet, _, err := track.ReadRTP()
		if err != nil {
			failures <- err
			return
		}
		pcm := make([]int16, outputmedia.SampleRate/25)
		if _, err := decoder.DecodeToInt16(packet.Payload, pcm); err != nil {
			failures <- err
			return
		}
		if !observed && stereoPeak(pcm) > 500 {
			first <- time.Now()
			observed = true
		}
	}
}
