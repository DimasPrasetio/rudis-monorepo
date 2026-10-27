// Package logger provides the process logger and the request-scoped one.
package logger

import (
	"context"
	"log/slog"
	"os"
)

// New returns the process logger — JSON in production (one line per event in `docker logs`),
// readable text in development — and makes it slog's default.
func New(env string) *slog.Logger {
	var h slog.Handler
	if env == "production" {
		h = slog.NewJSONHandler(os.Stdout, nil)
	} else {
		h = slog.NewTextHandler(os.Stdout, nil)
	}
	l := slog.New(h)
	slog.SetDefault(l)
	return l
}

type ctxKey struct{}

// WithContext returns ctx carrying l.
func WithContext(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

// From returns the logger the server attached to the request (it carries request_id), or
// the default logger outside a request.
func From(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}
