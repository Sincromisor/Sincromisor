package rtc

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/playback"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	pionopus "github.com/pion/opus"
	"github.com/pion/webrtc/v4"
)

func TestPlaybackSessionsLoopAndRemainIsolated(t *testing.T) {
	manager := newTestManager(t)
	decoder, err := synthdecode.NewDecoder("ffmpeg", synthdecode.ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	manager.config.Playback, err = playback.NewLoader("../../assets/playback/default", decoder)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = manager.CloseAll(testCloseContext(t), "test_teardown") })
	firstLog, secondLog := &playbackMessages{}, &playbackMessages{}
	first, firstInput, firstTracks := newEchoBrowserPeer(t, firstLog.observe)
	second, secondInput, secondTracks := newEchoBrowserPeer(t, secondLog.observe)
	t.Cleanup(func() { _ = first.Close(); _ = second.Close() })
	firstAnswer := negotiatePairWithMode(t, manager, first, "playback")
	secondAnswer := negotiatePairWithMode(t, manager, second, "playback")
	firstSession := activeSession(t, manager, firstAnswer.SessionID)
	secondSession := activeSession(t, manager, secondAnswer.SessionID)
	if firstSession.pipeline != nil || secondSession.pipeline != nil {
		t.Fatal("playback created downstream")
	}
	firstTrack := waitEchoRemoteTrack(t, firstTracks)
	secondTrack := waitEchoRemoteTrack(t, secondTracks)
	writeEchoTone(t, firstInput, 440)
	writeEchoTone(t, secondInput, 660)
	verifyPlaybackAudio(t, firstTrack, firstSession, firstLog)
	firstLog.assertLoops(t)
	if firstSession.ctx.Err() != nil {
		t.Fatal("input stopped playback")
	}
	secondBefore := secondLog.lastID()
	if err := firstSession.Close("normal"); err != nil {
		t.Fatal(err)
	}
	waitSessionDone(t, firstSession)
	if !firstSession.output.Stats().Closed {
		t.Fatal("output remained open")
	}
	deadline := time.Now().Add(6 * time.Second)
	for secondLog.lastID() <= secondBefore && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if secondLog.lastID() <= secondBefore || secondSession.ctx.Err() != nil || manager.Count() != 1 {
		t.Fatal("other session did not continue")
	}
	readNonSilentEcho(t, secondTrack)
}

// verifyPlaybackAudioは実配布音声を2周読み、周回境界でもRTP時計と有限キューが継続することを確認する。
func verifyPlaybackAudio(t *testing.T, track *webrtc.TrackRemote, session *Session, messages *playbackMessages) {
	t.Helper()
	decoder, err := pionopus.NewDecoderWithOutput(outputmedia.SampleRate, 2)
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(13 * time.Second)
	_ = track.SetReadDeadline(deadline)
	defer track.SetReadDeadline(time.Time{})
	var firstStamp, previous uint32
	var previousSequence uint16
	count, firstSound, secondSound := 0, 0, 0
	for time.Now().Before(deadline) {
		packet, _, err := track.ReadRTP()
		if err != nil {
			t.Fatal(err)
		}
		if count == 0 {
			firstStamp = packet.Timestamp
		} else if packet.Timestamp-previous != uint32(uint16(packet.SequenceNumber-previousSequence))*960 {
			t.Fatal("RTP clock reset at loop")
		}
		previous, previousSequence = packet.Timestamp, packet.SequenceNumber
		count++
		pcm := make([]int16, 1920)
		if _, err = decoder.DecodeToInt16(packet.Payload, pcm); err != nil {
			t.Fatal(err)
		}
		if stereoPeak(pcm) > 500 {
			if packet.Timestamp-firstStamp < 4*48000 {
				firstSound++
			} else {
				secondSound++
			}
		}
		if session.output.Stats().QueuedSpeeches > 1 {
			t.Fatal("playback prequeued multiple loops")
		}
		if messages.lastID() >= 3 && secondSound > 0 {
			break
		}
	}
	if firstSound == 0 || secondSound == 0 || messages.lastID() < 3 {
		t.Fatalf("two loops not heard: %d, %d, id=%d", firstSound, secondSound, messages.lastID())
	}
}

type playbackMessages struct {
	mu      sync.Mutex
	text    int
	first   []outputmedia.TelopPayload
	invalid bool
}

func (m *playbackMessages) observe(channel *webrtc.DataChannel) {
	channel.OnMessage(func(message webrtc.DataChannelMessage) {
		m.mu.Lock()
		defer m.mu.Unlock()
		if channel.Label() == textChannelLabel {
			m.text++
			return
		}
		var payload outputmedia.TelopPayload
		if json.Unmarshal(message.Data, &payload) != nil {
			m.invalid = true
			return
		}
		if len(m.first) == 0 || m.first[len(m.first)-1].SpeechID != payload.SpeechID {
			m.first = append(m.first, payload)
		}
	})
}
func (m *playbackMessages) lastID() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.first) == 0 {
		return 0
	}
	return m.first[len(m.first)-1].SpeechID
}
func (m *playbackMessages) assertLoops(t *testing.T) {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.text != 1 || m.invalid || len(m.first) < 3 {
		t.Fatalf("text=%d invalid=%v loops=%d", m.text, m.invalid, len(m.first))
	}
	for index, payload := range m.first {
		if payload.SpeechID != int64(index+1) || payload.Timestamp != 0 {
			t.Fatalf("loop start %+v", payload)
		}
	}
}
