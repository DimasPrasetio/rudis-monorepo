package kernel

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

// Scope is the organization a request works in: one company and, optionally, one branch. A
// module that keeps company data ("scoped": true in its manifest) filters every query by it.
type Scope struct {
	CompanyID int64          // always ≥ 1
	BranchID  int64          // 0: no branch — all of the company
	Location  *time.Location // the branch's time zone; nil: the app's (APP_TIMEZONE)
}

// DefaultCompany is the company of an app that keeps no organization structure.
const DefaultCompany int64 = 1

type scopeKey struct{}

// WithScope returns ctx working in s.
func WithScope(ctx context.Context, s Scope) context.Context {
	return context.WithValue(ctx, scopeKey{}, s)
}

// severalCompanies is set once a scope resolver is provided: from then on there is no default
// company to fall back to.
var severalCompanies atomic.Bool

// ScopeFrom is the scope ctx works in — never zero. A signed-in request always has one. Work
// with none — a calendar job, a public route, a task enqueued by either — falls to the default
// company in an app with one company; with a scope resolver (several companies) it panics
// rather than file data under the wrong one: background work over company data loops
// d.Scope.Companies with WithScope, and HasScope tells whether ctx carries one.
func ScopeFrom(ctx context.Context) Scope {
	if s, ok := ctx.Value(scopeKey{}).(Scope); ok && s.CompanyID > 0 {
		return s
	}
	if severalCompanies.Load() {
		panic("kernel: no scope in ctx, in an app with several companies — run work outside a request per company (d.Scope.Companies, kernel.WithScope)")
	}
	return Scope{CompanyID: DefaultCompany}
}

// HasScope reports whether ctx carries a scope, rather than falling to the default company.
func HasScope(ctx context.Context) bool {
	s, ok := ctx.Value(scopeKey{}).(Scope)
	return ok && s.CompanyID > 0
}

// ErrScopeDenied is what a resolver returns for a scope the user is not placed in.
var ErrScopeDenied = errors.New("scope not allowed")

// ScopeResolver is what an organization module provides: which company and branch a request
// works in, validated against where the user is placed.
type ScopeResolver interface {
	// Resolve returns the active scope for the signed-in user from the X-Scope header the web
	// sends ("<company>" or "<company>:<branch>"; empty: the user's default), or ErrScopeDenied.
	// A requested unit comes back exactly — "<company>" is the whole company (BranchID 0), and
	// only for a user placed across it — so callers may also use it to check a placement.
	Resolve(ctx context.Context, userID int64, requested string) (Scope, error)
	// Companies lists the active companies — for background work done per company.
	Companies(ctx context.Context) ([]Scope, error)
}

// ScopeSlot is the scope provider every module reaches through Deps.Scope. Without one, every
// request works in the default company — an app with one company does nothing.
type ScopeSlot struct {
	mu sync.RWMutex
	r  ScopeResolver
}

// Provide sets the scope resolver. Called once, from internal/modules/registry.go.
func (s *ScopeSlot) Provide(r ScopeResolver) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.r = r
	severalCompanies.Store(r != nil)
}

func (s *ScopeSlot) resolver() ScopeResolver {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.r
}

// Resolve returns the scope a request asks for. Without a resolver only the default company
// exists: asking for another one is refused, so a misconfigured client is noticed.
func (s *ScopeSlot) Resolve(ctx context.Context, userID int64, requested string) (Scope, error) {
	if r := s.resolver(); r != nil {
		return r.Resolve(ctx, userID, requested)
	}
	if requested != "" && requested != "1" {
		return Scope{}, ErrScopeDenied
	}
	return Scope{CompanyID: DefaultCompany}, nil
}

// Companies lists the companies background work runs for: the resolver's, else the default one.
func (s *ScopeSlot) Companies(ctx context.Context) ([]Scope, error) {
	if r := s.resolver(); r != nil {
		return r.Companies(ctx)
	}
	return []Scope{{CompanyID: DefaultCompany}}, nil
}

// actorKey carries who a piece of background work acts for (from the request that started it):
// what audit records name when no one is signed in.
type actorKey struct{}

func withActor(ctx context.Context, id int64) context.Context {
	return context.WithValue(ctx, actorKey{}, id)
}

// ActorFrom is the user a background task or event acts for (0: none). In a request, use
// d.Auth.UserID.
func ActorFrom(ctx context.Context) int64 {
	id, _ := ctx.Value(actorKey{}).(int64)
	return id
}
