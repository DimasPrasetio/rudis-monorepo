package kernel

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"runtime/debug"
	"strconv"
	"strings"
	"time"
)

// LastDay is Monthly's day for the last day of each month.
const LastDay = -1

// ScheduleOption adjusts a calendar job.
type ScheduleOption func(*calJob)

// Timeout bounds one run (default 30 minutes); its ctx is cancelled when it runs out.
func Timeout(d time.Duration) ScheduleOption { return func(j *calJob) { j.timeout = d } }

// CatchUp runs a tick missed while the API was down, once, if it is at most window old
// (default 24 hours; 0 turns it off).
func CatchUp(window time.Duration) ScheduleOption { return func(j *calJob) { j.catchUp = window } }

type calKind int

const (
	calDaily calKind = iota
	calWeekly
	calMonthly
)

// calSpec is when a calendar job runs, in the app's time zone.
type calSpec struct {
	kind         calKind
	hour, minute int
	weekday      time.Weekday
	day          int // 1–28, or LastDay
}

func (c calSpec) String() string {
	at := fmt.Sprintf("%02d:%02d", c.hour, c.minute)
	switch c.kind {
	case calWeekly:
		return "weekly " + strings.ToLower(c.weekday.String()) + " " + at
	case calMonthly:
		if c.day == LastDay {
			return "monthly last " + at
		}
		return fmt.Sprintf("monthly %d %s", c.day, at)
	}
	return "daily " + at
}

func parseAt(at string) (int, int, error) {
	h, m, ok := strings.Cut(at, ":")
	hour, err1 := strconv.Atoi(h)
	minute, err2 := strconv.Atoi(m)
	if !ok || err1 != nil || err2 != nil || len(h) != 2 || len(m) != 2 || hour > 23 || minute > 59 {
		return 0, 0, fmt.Errorf("%q is not HH:MM", at)
	}
	return hour, minute, nil
}

// tickOn is the instant the job fires on the given local day, or false when it does not fire
// that day. A local time that does not exist (a DST gap) fires at the first instant after the
// gap; one that exists twice (a DST overlap) fires at the first.
func (c calSpec) tickOn(y int, mo time.Month, d int, loc *time.Location) (time.Time, bool) {
	switch c.kind {
	case calWeekly:
		if time.Date(y, mo, d, 12, 0, 0, 0, loc).Weekday() != c.weekday {
			return time.Time{}, false
		}
	case calMonthly:
		last := time.Date(y, mo+1, 0, 12, 0, 0, 0, loc).Day()
		if (c.day == LastDay && d != last) || (c.day != LastDay && d != c.day) {
			return time.Time{}, false
		}
	}
	return localInstant(y, mo, d, c.hour, c.minute, loc), true
}

// localInstant is the first instant whose wall clock in loc reaches y-mo-d h:m. That is the
// usual instant; in a DST gap, the transition (the first instant past the missing time); in a
// DST overlap, the first of the two occurrences.
func localInstant(y int, mo time.Month, d, h, m int, loc *time.Location) time.Time {
	want := time.Date(y, mo, d, h, m, 0, 0, time.UTC)
	t := time.Date(y, mo, d, h, m, 0, 0, loc).Add(-3 * time.Hour).Truncate(time.Minute)
	for i := 0; i < 6*60; i++ {
		lt := t.In(loc)
		wall := time.Date(lt.Year(), lt.Month(), lt.Day(), lt.Hour(), lt.Minute(), 0, 0, time.UTC)
		if !wall.Before(want) {
			return t
		}
		t = t.Add(time.Minute)
	}
	return time.Date(y, mo, d, h, m, 0, 0, loc)
}

// next is the first tick strictly after t.
func (c calSpec) next(t time.Time, loc *time.Location) time.Time {
	lt := t.In(loc)
	for i := 0; i < 400; i++ {
		day := time.Date(lt.Year(), lt.Month(), lt.Day()+i, 12, 0, 0, 0, loc)
		if tick, ok := c.tickOn(day.Year(), day.Month(), day.Day(), loc); ok && tick.After(t) {
			return tick
		}
	}
	panic("calendar: no tick within 400 days") // unreachable for valid specs
}

// prev is the last tick at or before t.
func (c calSpec) prev(t time.Time, loc *time.Location) time.Time {
	lt := t.In(loc)
	for i := 0; i < 400; i++ {
		day := time.Date(lt.Year(), lt.Month(), lt.Day()-i, 12, 0, 0, 0, loc)
		if tick, ok := c.tickOn(day.Year(), day.Month(), day.Day(), loc); ok && !tick.After(t) {
			return tick
		}
	}
	panic("calendar: no tick within 400 days")
}

// calJob is a job on a calendar schedule.
type calJob struct {
	name     string
	spec     calSpec
	fn       func(ctx context.Context) error
	timeout  time.Duration
	catchUp  time.Duration
	timeouts int       // consecutive, for the warning; only its loop touches it
	done     time.Time // the last tick this process ran to the end: never claimed again here
}

// Daily runs fn every day at at ("02:00") in the app's time zone (APP_TIMEZONE).
func (s *JobsSlot) Daily(name, at string, fn func(ctx context.Context) error, opts ...ScheduleOption) {
	s.addCalendar(name, calDaily, at, 0, 0, fn, opts)
}

// Weekly runs fn every week on day at at.
func (s *JobsSlot) Weekly(name string, day time.Weekday, at string, fn func(ctx context.Context) error, opts ...ScheduleOption) {
	s.addCalendar(name, calWeekly, at, day, 0, fn, opts)
}

// Monthly runs fn every month on day (1–28, or LastDay) at at.
func (s *JobsSlot) Monthly(name string, day int, at string, fn func(ctx context.Context) error, opts ...ScheduleOption) {
	if day != LastDay && (day < 1 || day > 28) {
		panic(fmt.Sprintf("jobs: %q runs on day %d — use 1–28, or LastDay", name, day))
	}
	s.addCalendar(name, calMonthly, at, 0, day, fn, opts)
}

func (s *JobsSlot) addCalendar(name string, kind calKind, at string, wd time.Weekday, day int, fn func(ctx context.Context) error, opts []ScheduleOption) {
	h, m, err := parseAt(at)
	if err != nil {
		panic(fmt.Sprintf("jobs: %q: %v", name, err))
	}
	j := &calJob{name: name, spec: calSpec{kind: kind, hour: h, minute: m, weekday: wd, day: day}, fn: fn, timeout: 30 * time.Minute, catchUp: 24 * time.Hour}
	for _, o := range opts {
		o(j)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkName(name)
	s.calendar = append(s.calendar, j)
}

// recheck is how often a calendar job looks again for a tick it missed: one a shutdown cut
// short, or one a container that died left unfinished (taken over once its timeout passed).
var recheck = time.Minute

func (s *JobsSlot) calendarLoop(ctx context.Context, j *calJob) {
	defer s.wg.Done()
	loc := s.clock.Location()
	var since time.Time // when the job was first registered; zero until that is recorded
	tick := j.spec.next(s.clock.Now(), loc)
	for {
		if since.IsZero() {
			since = s.ensureSchedule(ctx, j)
		}
		// Catch up the last tick missed — while the API was down, cut short by a shutdown, or
		// left by a container that died — never one from before the job existed (a job deployed
		// at 10:00 does not run its 02:00 of that morning). A no-op when that tick ran, or runs.
		if now := s.clock.Now(); j.catchUp > 0 && !since.IsZero() {
			if prev := j.spec.prev(now, loc); now.Sub(prev) <= j.catchUp && prev.After(since) && prev.After(j.done) {
				s.fire(ctx, j, prev)
			}
		}
		timer := time.NewTimer(min(tick.Sub(s.clock.Now()), recheck))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		if !s.clock.Now().Before(tick) {
			s.fire(ctx, j, tick)
			tick = j.spec.next(tick, loc)
		}
	}
}

// ensureSchedule records the job and its spec, for the administrator's view, and returns when
// it was first registered — zero when that could not be read (catch-up waits for it).
func (s *JobsSlot) ensureSchedule(ctx context.Context, j *calJob) time.Time {
	now := s.clock.Now()
	if s.db == nil {
		return now // nothing to catch up from without a record of the runs
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO kernel_schedules (name, spec, created_at, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE spec = VALUES(spec)`,
		j.name, j.spec.String(), now, now); err != nil {
		if ctx.Err() == nil {
			s.log.Warn("jobs: could not record schedule", "job", j.name, "err", err)
		}
		return time.Time{}
	}
	var since time.Time
	if err := s.db.QueryRowContext(ctx, `SELECT created_at FROM kernel_schedules WHERE name = ?`, j.name).Scan(&since); err != nil {
		return time.Time{}
	}
	return since
}

// fire runs tick of j — once across every container: the one that records the tick runs it. A
// tick recorded as started but left unfinished past its timeout (its container died) is taken
// over; one that cannot be recorded (a database blip) is tried again while it is recent. The
// tick is claimed before a run slot is taken, so waiting on the database holds no slot.
func (s *JobsSlot) fire(ctx context.Context, j *calJob, tick time.Time) {
	var claim time.Time // the started_at this run wrote: what marks the run as this one's
	if s.db != nil {
		for {
			var err error
			claim, err = s.claimTick(ctx, j, tick)
			if err == nil {
				if claim.IsZero() {
					return // already run, or running, here or in another container
				}
				break
			}
			if ctx.Err() != nil {
				return
			}
			if s.clock.Now().Sub(tick) > max(j.catchUp, time.Hour) {
				s.log.Error("jobs: tick could not be recorded and is skipped", "job", j.name, "tick", tick, "err", err)
				return
			}
			s.log.Warn("jobs: tick not recorded yet, trying again", "job", j.name, "err", err)
			select {
			case <-time.After(30 * time.Second):
			case <-ctx.Done():
				return
			}
		}
	}
	select {
	case s.sem <- struct{}{}:
	case <-ctx.Done():
		s.forget(j, tick, claim)
		return
	}
	defer func() { <-s.sem }()
	// The wait for a slot counted against the takeover: stamp the claim again, and give way if
	// another container has taken the tick over meanwhile.
	if s.db != nil {
		var err error
		restamped, err := s.restamp(ctx, j, tick, claim)
		if err != nil {
			s.forget(j, tick, claim) // not run: let the catch-up try it again
			return
		}
		if restamped.IsZero() {
			return
		}
		claim = restamped
	}
	runCtx, cancel := context.WithTimeout(ctx, j.timeout)
	err := func() (err error) {
		defer func() {
			if v := recover(); v != nil {
				err = fmt.Errorf("panic: %v\n%s", v, debug.Stack())
			}
		}()
		return j.fn(runCtx)
	}()
	timedOut := errors.Is(runCtx.Err(), context.DeadlineExceeded)
	cancel()
	if err != nil && ctx.Err() != nil {
		s.forget(j, tick, claim) // cut short by shutdown: run again (catch-up)
		return
	}
	j.done = tick
	s.recordRun(j, tick, claim, err, timedOut)
}

// claimTick records tick as started by this container and returns the started_at it wrote —
// zero when another container has it (or had it: the tick ran).
func (s *JobsSlot) claimTick(ctx context.Context, j *calJob, tick time.Time) (time.Time, error) {
	now := s.clock.Now().Truncate(time.Microsecond) // as DATETIME(6) keeps it
	res, err := s.db.ExecContext(ctx,
		`INSERT IGNORE INTO kernel_schedule_runs (name, scheduled_for, started_at) VALUES (?, ?, ?)`, j.name, tick.UTC(), now)
	if err != nil {
		return time.Time{}, err
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return now, nil
	}
	res, err = s.db.ExecContext(ctx,
		`UPDATE kernel_schedule_runs SET started_at = ? WHERE name = ? AND scheduled_for = ? AND finished_at IS NULL AND started_at < ?`,
		now, j.name, tick.UTC(), now.Add(-j.timeout-time.Minute))
	if err != nil {
		return time.Time{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return time.Time{}, nil
	}
	s.log.Warn("jobs: taking over a tick whose run never finished", "job", j.name, "tick", tick)
	return now, nil
}

// restamp moves this container's claim on tick to now; zero when the claim is no longer its own.
func (s *JobsSlot) restamp(ctx context.Context, j *calJob, tick, claim time.Time) (time.Time, error) {
	now := s.clock.Now().Truncate(time.Microsecond)
	if !now.After(claim) {
		return claim, nil
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE kernel_schedule_runs SET started_at = ? WHERE name = ? AND scheduled_for = ? AND finished_at IS NULL AND started_at = ?`,
		now, j.name, tick.UTC(), claim)
	if err != nil {
		return time.Time{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return time.Time{}, nil
	}
	return now, nil
}

// forget drops this container's record of a tick cut short by shutdown, so it runs again — not
// a record another container has taken over since.
func (s *JobsSlot) forget(j *calJob, tick, claim time.Time) {
	if s.db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = s.db.ExecContext(ctx, `DELETE FROM kernel_schedule_runs WHERE name = ? AND scheduled_for = ? AND finished_at IS NULL AND started_at = ?`,
		j.name, tick.UTC(), claim)
}

func (s *JobsSlot) recordRun(j *calJob, tick, claim time.Time, runErr error, timedOut bool) {
	if timedOut {
		j.timeouts++
	} else {
		j.timeouts = 0
	}
	msg := ""
	if runErr != nil {
		msg = runErr.Error()
		if len(msg) > 1000 {
			msg = msg[:1000]
		}
		s.log.Error("job failed", "job", j.name, "tick", tick, "err", msg)
	}
	if s.db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	now := s.clock.Now()
	// Retried: a run left unfinished in the table would be taken over, and run again, elsewhere.
	var res sql.Result
	var err error
	for wait := time.Second; ; wait *= 2 {
		res, err = s.db.ExecContext(ctx,
			`UPDATE kernel_schedule_runs SET finished_at = ?, ok = ?, error = ? WHERE name = ? AND scheduled_for = ? AND started_at = ?`,
			now, runErr == nil, msg, j.name, tick.UTC(), claim)
		if err == nil || wait > 4*time.Second || ctx.Err() != nil {
			break
		}
		time.Sleep(wait)
	}
	if err != nil {
		s.log.Error("jobs: a finished run could not be recorded; another container may run it again", "job", j.name, "tick", tick, "err", err)
	}
	if err == nil {
		// 0 rows: taken over by another container — or already written by a try whose answer
		// was lost (MySQL counts changed rows), in which case the row is still this run's.
		if n, _ := res.RowsAffected(); n == 0 {
			var mine int
			_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM kernel_schedule_runs WHERE name = ? AND scheduled_for = ? AND started_at = ?`,
				j.name, tick.UTC(), claim).Scan(&mine)
			if mine == 0 {
				s.log.Warn("jobs: a run outlasted its takeover by another container", "job", j.name, "tick", tick)
				return // the other container records the tick
			}
		}
	}
	if runErr == nil {
		_, _ = s.db.ExecContext(ctx,
			`INSERT INTO kernel_schedules (name, spec, last_success_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE last_success_at = VALUES(last_success_at), failures = 0, first_failure_at = NULL, last_error = '', updated_at = VALUES(updated_at)`,
			j.name, j.spec.String(), now, now, now)
		return
	}
	_, _ = s.db.ExecContext(ctx,
		`INSERT INTO kernel_schedules (name, spec, failures, first_failure_at, last_error, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE failures = failures + 1, first_failure_at = COALESCE(first_failure_at, VALUES(first_failure_at)), last_error = VALUES(last_error), updated_at = VALUES(updated_at)`,
		j.name, j.spec.String(), now, msg, now, now)
	var failures int
	_ = s.db.QueryRowContext(ctx, `SELECT failures FROM kernel_schedules WHERE name = ?`, j.name).Scan(&failures)
	// Never switched off by itself — a silently disabled period close is worse than a loud one.
	if failures >= 5 || j.timeouts >= 3 {
		s.log.Error("job keeps failing — needs attention", "job", j.name, "failures_in_a_row", failures, "timeouts_in_a_row", j.timeouts)
	}
}

// purgeRuns drops calendar run history older than 90 days.
func (s *JobsSlot) purgeRuns(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM kernel_schedule_runs WHERE scheduled_for < ? LIMIT 5000`, s.clock.Now().Add(-90*24*time.Hour))
	return err
}
