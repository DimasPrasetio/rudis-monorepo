// Package pagination reads ?page=&limit= and builds the envelope's meta.
package pagination

import (
	"net/http"
	"strconv"
)

const (
	DefaultLimit = 10
	MaxLimit     = 100
)

// Params is a validated page request: Page >= 1, 1 <= Limit <= MaxLimit.
type Params struct {
	Page  int
	Limit int
}

// FromRequest reads ?page= and ?limit=. Missing or invalid values fall back to the
// defaults instead of failing, and limit is capped at MaxLimit.
func FromRequest(r *http.Request) Params {
	p := Params{Page: 1, Limit: DefaultLimit}
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 0 {
		p.Page = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		p.Limit = min(v, MaxLimit)
	}
	return p
}

// Offset is the number of rows to skip — the OFFSET of the page's query.
func (p Params) Offset() int { return (p.Page - 1) * p.Limit }

// Meta is the "meta" object of a paginated response.
type Meta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// NewMeta builds the meta for p given the total row count.
func NewMeta(p Params, total int64) Meta {
	pages := int((total + int64(p.Limit) - 1) / int64(p.Limit))
	return Meta{Page: p.Page, Limit: p.Limit, Total: total, TotalPages: pages}
}
