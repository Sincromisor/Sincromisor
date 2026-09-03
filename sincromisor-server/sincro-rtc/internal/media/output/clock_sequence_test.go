package output

import (
	"context"
	"math"
	"testing"
)

func TestOutputTimestampWraparound(t *testing.T) {
	clock := newFakeOutputClock()
	track := newFakeOutputTrack()
	start := uint64(math.MaxUint32) - uint64(frameSamples/2)
	processor := newOutputWithFakes(t, &fakeOutputEncoder{}, track, clock, start)
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, processor, ctx)
	clock.waitTimer(t)

	clock.advance(FrameDuration)
	first := receiveSample(t, track)
	clock.advance(3 * FrameDuration)
	second := receiveSample(t, track)
	if first.RTPTimestamp != uint32(start) {
		t.Fatalf("first RTP timestamp = %d, want %d", first.RTPTimestamp, uint32(start))
	}
	if want := uint32(start + 3*frameSamples); second.RTPTimestamp != want {
		t.Fatalf("wrapped RTP timestamp = %d, want %d", second.RTPTimestamp, want)
	}
	if second.SamplePosition != start+3*frameSamples {
		t.Fatalf("absolute sample position = %d, want %d", second.SamplePosition, start+3*frameSamples)
	}
	if got := second.MediaSample.PrevDroppedPackets; got != 2 {
		t.Fatalf("wrapped sample previous dropped packets = %d, want 2", got)
	}

	cancel()
	<-done
}

func TestOutputConsecutiveDropsAccumulateUntilSuccessfulWrite(t *testing.T) {
	track := newFakeOutputTrack()
	processor := newOutputWithFakes(
		t,
		&fakeOutputEncoder{},
		track,
		newFakeOutputClock(),
		0,
	)
	processor.skipSamplePositions(2)
	processor.skipSamplePositions(3)
	if err := processor.writeFrame(); err != nil {
		t.Fatalf("writeFrame() error = %v", err)
	}
	first := receiveSample(t, track)
	if got := first.MediaSample.PrevDroppedPackets; got != 5 {
		t.Fatalf("accumulated previous dropped packets = %d, want 5", got)
	}
	if err := processor.writeFrame(); err != nil {
		t.Fatalf("second writeFrame() error = %v", err)
	}
	second := receiveSample(t, track)
	if got := second.MediaSample.PrevDroppedPackets; got != 0 {
		t.Fatalf("previous dropped packets after successful write = %d, want 0", got)
	}

	processor.skipSamplePositions(math.MaxUint16 + 1)
	if err := processor.writeFrame(); err == nil {
		t.Fatal("writeFrame() accepted a drop count beyond Pion's uint16 boundary")
	}
}
