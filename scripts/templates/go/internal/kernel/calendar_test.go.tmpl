package kernel

import (
	"testing"
	"time"
)

func mustLoc(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func TestCalendarTicksInTheAppTimeZone(t *testing.T) {
	wib := mustLoc(t, "Asia/Jakarta")
	at := func(s string) time.Time {
		v, err := time.ParseInLocation("2006-01-02 15:04", s, wib)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	cases := []struct {
		spec       calSpec
		from, want string
	}{
		{calSpec{kind: calDaily, hour: 2}, "2026-03-10 01:59", "2026-03-10 02:00"},
		{calSpec{kind: calDaily, hour: 2}, "2026-03-10 02:00", "2026-03-11 02:00"},
		{calSpec{kind: calWeekly, weekday: time.Monday, hour: 7, minute: 30}, "2026-03-10 08:00", "2026-03-16 07:30"},
		{calSpec{kind: calMonthly, day: 1, hour: 0}, "2026-01-31 23:00", "2026-02-01 00:00"},
		{calSpec{kind: calMonthly, day: LastDay, hour: 23}, "2026-02-01 00:00", "2026-02-28 23:00"},
		{calSpec{kind: calMonthly, day: LastDay, hour: 23}, "2028-02-01 00:00", "2028-02-29 23:00"},
		{calSpec{kind: calMonthly, day: LastDay, hour: 23}, "2026-12-31 23:30", "2027-01-31 23:00"},
	}
	for _, c := range cases {
		if got := c.spec.next(at(c.from), wib); !got.Equal(at(c.want)) {
			t.Errorf("%s after %s = %s, want %s", c.spec, c.from, got.In(wib).Format("2006-01-02 15:04"), c.want)
		}
	}
	if got := (calSpec{kind: calDaily, hour: 2}).prev(at("2026-03-10 01:00"), wib); !got.Equal(at("2026-03-09 02:00")) {
		t.Errorf("prev = %s", got.In(wib))
	}
}

func TestCalendarDaylightSavingRules(t *testing.T) {
	ny := mustLoc(t, "America/New_York")
	// 2026-03-08 02:30 does not exist in New York: the tick is the first instant after the gap.
	gap := (calSpec{kind: calDaily, hour: 2, minute: 30}).next(time.Date(2026, 3, 8, 0, 0, 0, 0, ny), ny)
	if want := time.Date(2026, 3, 8, 3, 0, 0, 0, ny); !gap.Equal(want) {
		t.Errorf("gap: %s, want %s", gap.In(ny), want)
	}
	// 2026-11-01 01:30 happens twice: the tick is the first (EDT).
	overlap := (calSpec{kind: calDaily, hour: 1, minute: 30}).next(time.Date(2026, 11, 1, 0, 0, 0, 0, ny), ny)
	if _, offset := overlap.In(ny).Zone(); offset != -4*3600 {
		t.Errorf("overlap: %s is not the first 01:30", overlap.In(ny))
	}
}

func TestCalendarRefusesMistakes(t *testing.T) {
	for name, register := range map[string]func(s *JobsSlot){
		"bad time":  func(s *JobsSlot) { s.Daily("a.b", "2:00", nil) },
		"day 31":    func(s *JobsSlot) { s.Monthly("a.c", 31, "02:00", nil) },
		"duplicate": func(s *JobsSlot) { s.Every("a.d", time.Hour, nil); s.Daily("a.d", "02:00", nil) },
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
