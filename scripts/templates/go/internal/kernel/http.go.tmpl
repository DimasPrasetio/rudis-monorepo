package kernel

import (
	"fmt"
	"net/http"
	"sync"
)

// HTTPSlot lets kits add middleware (rate limits, metrics, tracing) from the composition root —
// Deps.HTTP. Middleware runs after the kernel's own (request ID, client IP, logging, panics,
// cross-site check) and before the routes, in the order added.
type HTTPSlot struct {
	mu     sync.Mutex
	names  []string
	mws    []func(http.Handler) http.Handler
	sealed bool
}

// Use adds middleware named name. Called only from internal/modules/registry.go.
func (s *HTTPSlot) Use(name string, mw func(http.Handler) http.Handler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sealed {
		panic(fmt.Sprintf("http: middleware %q added after the server was built — add it in registry.go", name))
	}
	for _, n := range s.names {
		if n == name {
			panic(fmt.Sprintf("http: middleware %q added twice", name))
		}
	}
	s.names = append(s.names, name)
	s.mws = append(s.mws, mw)
}

// Middleware returns what was added and refuses further additions — the server calls it once.
func (s *HTTPSlot) Middleware() []func(http.Handler) http.Handler {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sealed = true
	return append([]func(http.Handler) http.Handler(nil), s.mws...)
}
