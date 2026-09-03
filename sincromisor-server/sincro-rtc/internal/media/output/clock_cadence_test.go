package output

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
)

func TestOutputAbsoluteClockSilenceCadenceAndExpiredDrop(t *testing.T) {
	clock := newFakeOutputClock()
	encoder := &fakeOutputEncoder{}
	track := newFakeOutputTrack()
	processor := newOutputWithFakes(t, encoder, track, clock, 0)
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, processor, ctx)
	clock.waitTimer(t)

	clock.advance(19 * time.Millisecond)
	assertNoSample(t, track)
	clock.advance(time.Millisecond)
	first := receiveSample(t, track)
	if first.SamplePosition != 0 || first.RTPTimestamp != 0 {
		t.Fatalf("first clock sample = %d/%d, want 0/0", first.SamplePosition, first.RTPTimestamp)
	}
	assertSilenceFrame(t, encoder.frameAt(t, 0))

	clock.advance(FrameDuration)
	second := receiveSample(t, track)
	if second.SamplePosition != frameSamples {
		t.Fatalf("second sample position = %d, want %d", second.SamplePosition, frameSamples)
	}

	// 次の絶対期限は60 msである。160 msに到達すると無音枠5つを期限切れにし、
	// タイムスタンプだけを進めてパケットは1つだけ生成する。
	clock.advance(120 * time.Millisecond)
	afterDrop := receiveSample(t, track)
	if got := processor.Stats().SilenceDropped; got != 5 {
		t.Fatalf("silence dropped = %d, want 5", got)
	}
	if want := uint64(frameSamples * 7); afterDrop.SamplePosition != want {
		t.Fatalf("post-drop position = %d, want %d", afterDrop.SamplePosition, want)
	}
	if got := afterDrop.MediaSample.PrevDroppedPackets; got != 5 {
		t.Fatalf("post-drop previous dropped packets = %d, want 5", got)
	}
	assertNoSample(t, track)

	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if !clock.timerStopped() {
		t.Fatal("Run did not stop its owned timer")
	}
}

func TestOutputSpeechLagBoundaryAbortOrderAndNextCadence(t *testing.T) {
	clock := newFakeOutputClock()
	encoder := &fakeOutputEncoder{}
	track := newFakeOutputTrack()
	processor := newOutputWithFakes(t, encoder, track, clock, 0)
	if err := processor.Enqueue("first", synthdecode.DecodedSpeech{
		SpeechID: 1, PCM: constantPCM(3*frameSamples, 11),
	}); err != nil {
		t.Fatalf("Enqueue(first) error = %v", err)
	}
	if err := processor.Enqueue("second", synthdecode.DecodedSpeech{
		SpeechID: 2, PCM: constantPCM(frameSamples, 22),
	}); err != nil {
		t.Fatalf("Enqueue(second) error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, processor, ctx)
	clock.waitTimer(t)

	clock.advance(FrameDuration)
	_ = receiveSample(t, track)
	if got := encoder.frameAt(t, 0)[0]; got != 11 {
		t.Fatalf("first speech sample = %d, want 11", got)
	}

	// 250 msちょうどの遅延は受理する。遅れた発話枠を一括送信せず、絶対期限を引き直す。
	clock.advance(FrameDuration + SpeechLagAbortThreshold)
	acceptedAtBoundary := receiveSample(t, track)
	if got := acceptedAtBoundary.MediaSample.PrevDroppedPackets; got != 12 {
		t.Fatalf("threshold frame previous dropped packets = %d, want 12", got)
	}
	if got := processor.Stats().SpeechAborted; got != 0 {
		t.Fatalf("speech aborted at threshold = %d, want 0", got)
	}
	if got := encoder.frameAt(t, 1)[0]; got != 11 {
		t.Fatalf("second speech frame sample = %d, want 11", got)
	}
	assertNoSample(t, track)

	// 新しい期限は受理した遅延枠の20 ms後である。1 nsでも超過すると、
	// 最初の発話の残りだけを中断する。
	clock.advance(FrameDuration + SpeechLagAbortThreshold + time.Nanosecond)
	assertNoSample(t, track)
	waitForOutputStat(t, processor, func(stats Stats) bool { return stats.SpeechAborted == 1 })

	clock.advance(FrameDuration - time.Nanosecond)
	assertNoSample(t, track)
	clock.advance(time.Nanosecond)
	afterAbort := receiveSample(t, track)
	if got := encoder.frameAt(t, 2)[0]; got != 22 {
		t.Fatalf("next speech sample = %d, want 22", got)
	}
	if got := afterAbort.MediaSample.PrevDroppedPackets; got != 13 {
		t.Fatalf("post-abort previous dropped packets = %d, want 13", got)
	}
	if want := uint64(27 * frameSamples); afterAbort.SamplePosition != want {
		t.Fatalf("post-abort sample position = %d, want %d", afterAbort.SamplePosition, want)
	}

	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
}
