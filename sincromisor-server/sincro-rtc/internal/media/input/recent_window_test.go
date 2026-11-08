package input

import "testing"

func TestRecentWindowExpiresAcrossPacketLoss(t *testing.T) {
	stream := &inputStream{recent: make(map[uint64]struct{})}
	for sequence := uint64(1 << 16); sequence < (1<<16)+1000; sequence++ {
		if sequence%3 == 0 {
			continue
		}
		stream.remember(sequence)
		if len(stream.recent) > int(reorderWindowPackets) {
			t.Fatalf("recent contains %d entries after packet loss", len(stream.recent))
		}
		for previous := range stream.recent {
			if previous+reorderWindowPackets <= sequence {
				t.Fatalf("expired sequence %d remains at %d", previous, sequence)
			}
		}
	}
}
