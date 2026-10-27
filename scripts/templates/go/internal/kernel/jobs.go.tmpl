package kernel

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"runtime/debug"
	"sync"
	"time"
)

// maxConcurrentJobs bounds how many jobs run at once: the pool has 10 connections and the
// requests come first.
const maxConcurrentJobs = 2

// JobsSlot runs background work on a schedule — d.Jobs.Every. It is a kernel slot because only
// the process (cmd/server) can start and stop work cleanly; a module cannot.
//
// One scheduler serves the whole app: at most two jobs run at a time, a job never overlaps
// itself, its first run waits a random moment so jobs registered together do not fire
// together, and a panic is logged instead of taking the process down. Each run holds a MySQL
// named lock (GET_LOCK) scoped to this app's database, so while a deploy briefly runs two
// containers — or if the app ever runs twice — a job still runs in one place at a time. A job
// that works through rows should still claim them (SELECT … FOR UPDATE SKIP LOCKED) and be safe
// to repeat: a run can be cut short by a shutdown.
type JobsSlot struct {
	db     *sql.DB // nil in tests: runs without the lock
	prefix string  // the database name: GET_LOCK names are server-wide
	clock  Clock
	log    *slog.Logger
	sem    chan struct{}

	mu       sync.Mutex
	jobs     []*job
	calendar []*calJob
	started  bool
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

type job struct {
	name  string
	every time.Duration
	fn    func(ctx context.Context) error
	// skipped counts runs in a row that found the lock held elsewhere (only its loop touches it).
	skipped int
}

// skipsBeforeWarning is how many runs in a row may find the lock held before it is logged: a
// deploy overlaps for one or two runs, a lock held for longer means something else holds it.
const skipsBeforeWarning = 5

// NewJobsSlot returns the slot. lockPrefix scopes the named locks (the database name); clock
// places calendar schedules (Daily, Weekly, Monthly) in the app's time zone.
func NewJobsSlot(db *sql.DB, lockPrefix string, clock Clock, log *slog.Logger) *JobsSlot {
	if clock == nil {
		clock = NewClock(nil)
	}
	s := &JobsSlot{db: db, prefix: lockPrefix, clock: clock, log: log, sem: make(chan struct{}, maxConcurrentJobs)}
	if db != nil {
		s.Every("kernel.schedule-runs-purge", 24*time.Hour, s.purgeRuns)
	}
	return s
}

// checkName refuses a name already taken by an interval or a calendar job. Called with s.mu held.
func (s *JobsSlot) checkName(name string) {
	if s.started {
		panic(fmt.Sprintf("jobs: %q registered after the scheduler started — register jobs in New", name))
	}
	if name == "" || len(name) > 100 {
		panic(fmt.Sprintf("jobs: %q must be <module>.<job>, at most 100 characters", name))
	}
	for _, j := range s.jobs {
		if j.name == name {
			panic(fmt.Sprintf("jobs: %q registered twice", name))
		}
	}
	for _, j := range s.calendar {
		if j.name == name {
			panic(fmt.Sprintf("jobs: %q registered twice", name))
		}
	}
}

// Every runs fn every interval, from shortly after the API starts until it stops. Call it in a
// module's New; name it "<module>.<job>". fn receives a context that is cancelled on shutdown.
func (s *JobsSlot) Every(name string, interval time.Duration, fn func(ctx context.Context) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkName(name)
	if interval < time.Second {
		panic(fmt.Sprintf("jobs: %q runs every %s — the minimum is 1s", name, interval))
	}
	s.jobs = append(s.jobs, &job{name: name, every: interval, fn: fn})
}

// Start begins running the registered jobs. Called once by cmd/server after the modules are
// built.
func (s *JobsSlot) Start(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started {
		return
	}
	s.started = true
	ctx, s.cancel = context.WithCancel(ctx)
	for _, j := range s.jobs {
		s.wg.Add(1)
		go s.loop(ctx, j)
	}
	for _, j := range s.calendar {
		s.wg.Add(1)
		go s.calendarLoop(ctx, j)
	}
}

// Stop cancels every job and waits for running ones to return, until ctx ends.
func (s *JobsSlot) Stop(ctx context.Context) error {
	s.mu.Lock()
	cancel := s.cancel
	s.mu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("jobs: still running at shutdown: %w", ctx.Err())
	}
}

func (s *JobsSlot) loop(ctx context.Context, j *job) {
	defer s.wg.Done()
	first := min(j.every, 10*time.Second)
	timer := time.NewTimer(time.Duration(rand.Int64N(int64(first))) + time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		s.run(ctx, j)
		timer.Reset(j.every)
	}
}

func (s *JobsSlot) run(ctx context.Context, j *job) {
	select {
	case s.sem <- struct{}{}:
	case <-ctx.Done():
		return
	}
	defer func() { <-s.sem }()
	defer func() {
		if v := recover(); v != nil {
			s.log.Error("job panicked", "job", j.name, "value", v, "stack", string(debug.Stack()))
		}
	}()
	release, ok, err := s.lock(ctx, j.name)
	if err != nil {
		if ctx.Err() == nil {
			s.log.Warn("job not run: lock unavailable", "job", j.name, "err", err)
		}
		return
	}
	if !ok {
		// Running in another instance right now — normal while a deploy overlaps.
		if j.skipped++; j.skipped == skipsBeforeWarning {
			s.log.Warn("job keeps finding its lock held elsewhere — another instance of this app, or another app on the same database name", "job", j.name, "runs_skipped", j.skipped)
		}
		return
	}
	j.skipped = 0
	defer release()
	start := time.Now()
	if err := j.fn(ctx); err != nil && ctx.Err() == nil {
		s.log.Error("job failed", "job", j.name, "err", err, "duration_ms", time.Since(start).Milliseconds())
	}
}

// lock takes the job's named lock on a dedicated connection (named locks belong to a session).
func (s *JobsSlot) lock(ctx context.Context, name string) (release func(), ok bool, err error) {
	if s.db == nil {
		return func() {}, true, nil
	}
	key := s.prefix + ":" + name
	if len(key) > 64 { // MySQL's limit for a lock name
		sum := sha256.Sum256([]byte(key))
		key = "job:" + hex.EncodeToString(sum[:20])
	}
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return nil, false, err
	}
	var got sql.NullInt64
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 0)", key).Scan(&got); err != nil {
		conn.Close()
		return nil, false, err
	}
	if got.Int64 != 1 {
		conn.Close()
		return nil, false, nil
	}
	return func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if _, err := conn.ExecContext(ctx, "DO RELEASE_LOCK(?)", key); err != nil {
			// The session may still hold the lock: discard it instead of returning it to the pool,
			// where it would keep the job from running anywhere.
			_ = conn.Raw(func(any) error { return driver.ErrBadConn })
		}
		conn.Close()
	}, true, nil
}
