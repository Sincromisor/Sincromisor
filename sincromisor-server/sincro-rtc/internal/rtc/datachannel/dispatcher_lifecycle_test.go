package datachannel

import (
	"errors"
	"testing"
)

func TestDataChannelAttachAndCloseShareWorkerReservation(t *testing.T) {
	t.Run("attach wins reservation and close joins worker", func(t *testing.T) {
		dispatcher := newDispatcherForTest(t, func(error) {})
		channel := newFakeDataChannel(0)
		channel.thresholdEntered = make(chan struct{})
		channel.thresholdRelease = make(chan struct{})
		attachDone := make(chan error, 1)
		go func() { attachDone <- dispatcher.AttachText(channel) }()
		<-channel.thresholdEntered

		closeDone := make(chan error, 1)
		go func() { closeDone <- dispatcher.Close() }()
		select {
		case err := <-closeDone:
			t.Fatalf("Close returned before attach reservation completed: %v", err)
		default:
		}
		close(channel.thresholdRelease)
		if err := <-attachDone; err != nil {
			t.Fatalf("AttachText() error = %v", err)
		}
		if err := <-closeDone; err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if got := dispatcher.Stats().ActiveWorkers; got != 0 {
			t.Fatalf("active workers after Close = %d, want 0", got)
		}
	})

	t.Run("close wins and later attach is rejected", func(t *testing.T) {
		dispatcher := newDispatcherForTest(t, func(error) {})
		if err := dispatcher.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		err := dispatcher.AttachText(newFakeDataChannel(0))
		if !errors.Is(err, ErrDataChannelDispatcherClosed) {
			t.Fatalf("AttachText() error = %v, want dispatcher closed", err)
		}
		if got := dispatcher.Stats().ActiveWorkers; got != 0 {
			t.Fatalf("active workers = %d, want 0", got)
		}
	})
}
