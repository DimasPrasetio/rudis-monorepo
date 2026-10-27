package kernel

import (
	"context"
	"fmt"
	"time"
)

// Clock is the time every kernel slot reads — d.Clock. Modules use it too, so a test can move
// time (kerneltest.Clock) instead of waiting for it.
type Clock interface {
	Now() time.Time           // UTC
	Location() *time.Location // APP_TIMEZONE: where business dates and calendar schedules are counted
}

type systemClock struct{ loc *time.Location }

// NewClock returns the real clock for loc (time.UTC when nil).
func NewClock(loc *time.Location) Clock {
	if loc == nil {
		loc = time.UTC
	}
	return systemClock{loc: loc}
}

func (c systemClock) Now() time.Time           { return time.Now().UTC() }
func (c systemClock) Location() *time.Location { return c.loc }

// Date is a calendar day without a time: an invoice date, an attendance day. Stored as DATE.
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

// DateOf is the day t falls on in loc.
func DateOf(t time.Time, loc *time.Location) Date {
	y, m, d := t.In(loc).Date()
	return Date{y, m, d}
}

// String is the ISO form, 2006-01-02.
func (d Date) String() string { return fmt.Sprintf("%04d-%02d-%02d", d.Year, d.Month, d.Day) }

// Start is the first instant of the day in loc.
func (d Date) Start(loc *time.Location) time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, loc)
}

// Today is the business date of the request: in its scope's time zone (a branch's), else the
// app's.
func Today(ctx context.Context, c Clock) Date {
	var loc *time.Location
	if HasScope(ctx) {
		loc = ScopeFrom(ctx).Location
	}
	if loc == nil {
		loc = c.Location()
	}
	return DateOf(c.Now(), loc)
}
