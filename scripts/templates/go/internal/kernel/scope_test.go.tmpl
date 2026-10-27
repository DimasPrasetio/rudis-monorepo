package kernel

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// signedIn is an Authenticator that lets every request through as user 7.
type signedIn struct{}

type uidKey struct{}

func (signedIn) Require(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), uidKey{}, int64(7))))
	})
}

func (signedIn) UserID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(uidKey{}).(int64)
	return id, ok
}

// branches places user 7 in company 2, branches 5 and 6.
type branches struct{}

func (branches) Resolve(_ context.Context, uid int64, requested string) (Scope, error) {
	switch requested {
	case "", "2":
		return Scope{CompanyID: 2}, nil
	case "2:5", "2:6":
		return Scope{CompanyID: 2, BranchID: int64(requested[2] - '0')}, nil
	}
	return Scope{}, ErrScopeDenied
}

func (branches) Companies(context.Context) ([]Scope, error) { return []Scope{{CompanyID: 2}}, nil }

func serve(auth *AuthSlot, header string) (int, Scope) {
	var got Scope
	h := auth.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { got = ScopeFrom(r.Context()) }))
	req := httptest.NewRequest("GET", "/api/v1/x", nil)
	if header != "" {
		req.Header.Set("X-Scope", header)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, got
}

func TestScopeDefaultsToOneCompany(t *testing.T) {
	if s := ScopeFrom(context.Background()); s.CompanyID != DefaultCompany || s.BranchID != 0 {
		t.Fatalf("default scope = %+v", s)
	}
	auth := NewAuthSlot(&ScopeSlot{})
	auth.Provide(signedIn{})
	if code, s := serve(auth, ""); code != 200 || s.CompanyID != 1 {
		t.Fatalf("no resolver: %d %+v", code, s)
	}
	if code, _ := serve(auth, "2"); code != http.StatusForbidden {
		t.Fatalf("another company without a resolver must be refused, got %d", code)
	}
}

func TestScopeIsResolvedAndCheckedPerRequest(t *testing.T) {
	scope := &ScopeSlot{}
	scope.Provide(branches{})
	t.Cleanup(func() { scope.Provide(nil) })
	auth := NewAuthSlot(scope)
	auth.Provide(signedIn{})
	if code, s := serve(auth, "2:6"); code != 200 || s.CompanyID != 2 || s.BranchID != 6 {
		t.Fatalf("2:6 → %d %+v", code, s)
	}
	if code, _ := serve(auth, "3"); code != http.StatusForbidden {
		t.Fatalf("a company the user is not placed in: want 403, got %d", code)
	}
}

func TestUnitsFallBackToCan(t *testing.T) {
	auth := NewAuthSlot(nil)
	authz := NewAuthzSlot(auth)
	u, err := authz.Units(context.Background(), "x.read")
	if err != nil || u.AllBranches || u.Includes(3) {
		t.Fatalf("signed out: %+v %v", u, err)
	}
	auth.Provide(signedIn{})
	ctx := context.WithValue(context.Background(), uidKey{}, int64(7))
	if u, _ := authz.Units(ctx, "x.read"); !u.AllBranches || !u.Includes(3) {
		t.Fatalf("signed in, no provider: %+v", u)
	}
}

func TestWithSeveralCompaniesThereIsNoDefault(t *testing.T) {
	scope := &ScopeSlot{}
	scope.Provide(branches{})
	t.Cleanup(func() { scope.Provide(nil) })
	if s := ScopeFrom(WithScope(context.Background(), Scope{CompanyID: 2})); s.CompanyID != 2 {
		t.Fatalf("scope = %+v", s)
	}
	defer func() {
		if recover() == nil {
			t.Fatal("work without a scope fell to company 1 in an app with several companies")
		}
	}()
	ScopeFrom(context.Background())
}
