package request

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestStreamOutlivesTheWriteTimeoutAndEndsOnShutdown(t *testing.T) {
	shutdown := make(chan struct{})
	ended := make(chan struct{})
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s, err := AllowStream(w, r.WithContext(WithShutdown(r.Context(), shutdown)))
		if err != nil {
			t.Error(err)
			return
		}
		defer s.Close()
		defer close(ended)
		_ = s.Send("first", map[string]int{"n": 1})
		time.Sleep(400 * time.Millisecond) // past the write timeout
		_ = s.Send("second", map[string]int{"n": 2})
		<-s.Context().Done()
	}))
	srv.Config.WriteTimeout = 200 * time.Millisecond
	srv.Start()
	defer srv.Close()
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	r := bufio.NewReader(resp.Body)
	var seen []string
	for len(seen) < 2 {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatalf("stream cut after %v: %v", seen, err)
		}
		if strings.HasPrefix(line, "event: ") {
			seen = append(seen, strings.TrimSpace(strings.TrimPrefix(line, "event: ")))
		}
	}
	close(shutdown)
	select {
	case <-ended:
	case <-time.After(2 * time.Second):
		t.Fatal("stream did not end on shutdown")
	}
}
