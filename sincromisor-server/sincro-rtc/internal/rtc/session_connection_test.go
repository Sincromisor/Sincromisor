package rtc

import (
	"errors"
	"testing"
)

func TestManagerConnectionDataChannelsAndClose(t *testing.T) {
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
	manager := newTestManagerWithFactory(t, factory)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)
	if manager.Count() != 1 {
		t.Fatalf("Count() = %d, want 1 after offer", manager.Count())
	}
	if manager.reservations != 0 {
		t.Fatalf("reservations = %d, want 0 after Session publication", manager.reservations)
	}
	if answer.SessionID == "" {
		t.Fatal("Create() returned empty session ID")
	}
	duplicate, err := manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if err != nil || duplicate {
		t.Fatalf("AddCandidate(end-of-candidates) = (%v, %v), want applied", duplicate, err)
	}
	duplicate, err = manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if err != nil || !duplicate {
		t.Fatalf("AddCandidate(duplicate end-of-candidates) = (%v, %v), want duplicate", duplicate, err)
	}

	session := activeSession(t, manager, answer.SessionID)
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
	waitForRemoteSessionClose(t, manager, answer.SessionID, session)
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0 after close", manager.Count())
	}
	assertNoPipelineCall(t, factory)
	duplicate, err = manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if duplicate || !errors.Is(err, ErrSessionClosed) {
		t.Fatalf("closed candidate = (%v, %v), want ErrSessionClosed", duplicate, err)
	}
}
