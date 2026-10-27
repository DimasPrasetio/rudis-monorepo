package kernel

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestJobsRunRepeatedlyAndNeverOverlap(t *testing.T) {
	s := NewJobsSlot(nil, "test", nil, quietLog())
	var runs, running, overlapped atomic.Int32
	s.Every("test.slow", time.Second, func(ctx context.Context) error {
		if running.Add(1) > 1 {
			overlapped.Store(1)
		}
		defer running.Add(-1)
		runs.Add(1)
		time.Sleep(1200 * time.Millisecond) // longer than the interval
		return nil
	})
	s.Every("test.fails", time.Second, func(context.Context) error { return errors.New("boom") })
	s.Every("test.panics", time.Second, func(context.Context) error { panic("boom") })
	s.Start(context.Background())
	time.Sleep(4500 * time.Millisecond)
	stop, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := s.Stop(stop); err != nil {
		t.Fatal(err)
	}
	if runs.Load() < 2 {
		t.Fatalf("ran %d times in 4.5s, want at least 2", runs.Load())
	}
	if overlapped.Load() != 0 {
		t.Fatal("a job overlapped itself")
	}
}

func TestStopCancelsARunningJob(t *testing.T) {
	s := NewJobsSlot(nil, "test", nil, quietLog())
	started := make(chan struct{})
	var cancelled atomic.Bool
	s.Every("test.long", time.Second, func(ctx context.Context) error {
		close(started)
		<-ctx.Done()
		cancelled.Store(true)
		return ctx.Err()
	})
	s.Start(context.Background())
	<-started
	stop, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := s.Stop(stop); err != nil || !cancelled.Load() {
		t.Fatalf("stop: err=%v cancelled=%v", err, cancelled.Load())
	}
}

func TestEveryRefusesMistakes(t *testing.T) {
	for name, register := range map[string]func(s *JobsSlot){
		"duplicate":   func(s *JobsSlot) { s.Every("a.b", time.Second, nil); s.Every("a.b", time.Second, nil) },
		"too often":   func(s *JobsSlot) { s.Every("a.c", time.Millisecond, nil) },
		"after start": func(s *JobsSlot) { s.Start(context.Background()); s.Every("a.d", time.Second, nil) },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("%s: no panic", name)
				}
			}()
			register(NewJobsSlot(nil, "test", nil, quietLog()))
		}()
	}
}
