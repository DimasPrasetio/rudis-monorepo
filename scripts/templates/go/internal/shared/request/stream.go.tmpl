package request

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type shutdownKey struct{}

// WithShutdown records a channel closed when the server starts shutting down; the server's
// middleware sets it for every request, so a stream ends instead of holding the drain.
func WithShutdown(ctx context.Context, ch <-chan struct{}) context.Context {
	return context.WithValue(ctx, shutdownKey{}, ch)
}

// heartbeat keeps proxies and browsers from closing an idle stream.
const heartbeat = 20 * time.Second

// writeTimeout bounds one write: a client that stopped reading is dropped instead of holding
// the stream (and its goroutines) forever.
const writeTimeout = 10 * time.Second

// Stream is a server-sent event stream (text/event-stream) — see AllowStream.
type Stream struct {
	w      http.ResponseWriter
	rc     *http.ResponseController
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.Mutex
	done   chan struct{}
}

// AllowStream turns this request into a server-sent event stream: a write deadline per event
// instead of the server's 60 s for the whole response, no caching, no proxy buffering, a heartbeat every 20 s. Its
// Context ends when the client leaves or the server starts shutting down. The handler must
// `defer s.Close()` and must not hold a database connection while it waits; an event is a hint
// — the client fetches the data again, also after reconnecting. Mount streams at
// /api/v1/<module>/stream… — the deploy's nginx passes those unbuffered.
func AllowStream(w http.ResponseWriter, r *http.Request) (*Stream, error) {
	rc := http.NewResponseController(w)
	if err := rc.SetWriteDeadline(time.Time{}); err != nil {
		return nil, fmt.Errorf("stream: %w", err)
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if err := rc.Flush(); err != nil {
		return nil, fmt.Errorf("stream: %w", err)
	}
	ctx, cancel := context.WithCancel(r.Context())
	if ch, ok := r.Context().Value(shutdownKey{}).(<-chan struct{}); ok {
		go func() {
			select {
			case <-ch:
				cancel()
			case <-ctx.Done():
			}
		}()
	}
	s := &Stream{w: w, rc: rc, ctx: ctx, cancel: cancel, done: make(chan struct{})}
	go s.beat()
	return s, nil
}

// Context ends when the client leaves or the server shuts down.
func (s *Stream) Context() context.Context { return s.ctx }

// Send writes one event (data as JSON) and flushes it.
func (s *Stream) Send(event string, data any) error {
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return s.write(fmt.Sprintf("event: %s\ndata: %s\n\n", event, body))
}

func (s *Stream) write(chunk string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ctx.Err() != nil {
		return s.ctx.Err()
	}
	if err := s.rc.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
		s.cancel()
		return err
	}
	if _, err := fmt.Fprint(s.w, chunk); err != nil {
		s.cancel()
		return err
	}
	if err := s.rc.Flush(); err != nil {
		s.cancel()
		return err
	}
	return nil
}

func (s *Stream) beat() {
	defer close(s.done)
	t := time.NewTicker(heartbeat)
	defer t.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-t.C:
			_ = s.write(": ping\n\n")
		}
	}
}

// Close ends the stream; call it (deferred) before the handler returns.
func (s *Stream) Close() {
	s.cancel()
	<-s.done
}
