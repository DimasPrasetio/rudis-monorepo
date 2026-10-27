package kernel

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sync"
	"time"
)

// Event is something a module announces happened, as a subscriber receives it.
type Event struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`    // "<module>.<thing>.<past-verb>", e.g. "sales.invoice.posted"
	Version    int             `json:"version"` // the payload's schema version, from the publisher's contract
	OccurredAt time.Time       `json:"occurred_at"`
	Payload    json.RawMessage `json:"payload"` // decode into the subscriber's own struct
}

// EventsSlot carries events between modules that never import each other — Deps.Events. A
// publisher names what happened; subscribers are wired to it in the composition root. Each
// delivery is a task (d.Tasks) written in the publisher's transaction: an event exists only if
// the change it announces committed, survives a crash, and reaches each subscriber in that
// subscriber's own transaction — one failing subscriber neither blocks the others nor undoes
// the publisher. Deliveries are at least once and not ordered: subscribers rely on the
// document's version or time, never on arrival order.
type EventsSlot struct {
	tasks *TasksSlot
	tx    *TxSlot
	clock Clock

	mu        sync.Mutex
	subs      map[string][]string // event name → subscribers
	published []Event             // without a database — for tests
}

// NewEventsSlot returns the slot.
func NewEventsSlot(tasks *TasksSlot, tx *TxSlot, clock Clock) *EventsSlot {
	return &EventsSlot{tasks: tasks, tx: tx, clock: clock, subs: map[string][]string{}}
}

var (
	validEvent      = regexp.MustCompile(`^[a-z][a-z0-9-]*(\.[a-z][a-z0-9_-]*){2,}$`)
	validSubscriber = regexp.MustCompile(`^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*$`)
)

// On subscribes h to the event name as subscriber ("<module>.<reaction>", unique app-wide).
// Called only from internal/modules/registry.go, before the API starts. A publisher that is not
// installed simply never fires it.
func (e *EventsSlot) On(name, subscriber string, h func(ctx context.Context, ev Event) error, k ...TaskKind) {
	if !validEvent.MatchString(name) {
		panic(fmt.Sprintf("events: %q must be <module>.<thing>.<past-verb>", name))
	}
	if !validSubscriber.MatchString(subscriber) {
		panic(fmt.Sprintf("events: subscriber %q must be <module>.<reaction>", subscriber))
	}
	kind := TaskKind{Lane: LaneShort, MaxAttempts: 10}
	if len(k) > 0 {
		kind = k[0]
	}
	e.tasks.Register("event:"+subscriber, func(ctx context.Context, t Task) error {
		var ev Event
		if err := json.Unmarshal(t.Payload, &ev); err != nil {
			return fmt.Errorf("events: %s: %w", subscriber, err)
		}
		return h(ctx, ev)
	}, kind)
	e.mu.Lock()
	defer e.mu.Unlock()
	e.subs[name] = append(e.subs[name], subscriber)
}

// Publish announces name with payload (stored as JSON). Inside d.Tx the deliveries are written
// in that transaction; outside, in a transaction of their own.
func (e *EventsSlot) Publish(ctx context.Context, name string, version int, payload any) error {
	if !validEvent.MatchString(name) {
		return fmt.Errorf("events: %q must be <module>.<thing>.<past-verb>", name)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("events: %s payload: %w", name, err)
	}
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	now := e.clock.Now()
	ev := Event{ID: fmt.Sprintf("%012x%s", now.UnixMilli(), hex.EncodeToString(b)), Name: name, Version: version, OccurredAt: now, Payload: body}
	e.mu.Lock()
	subs := append([]string(nil), e.subs[name]...)
	e.mu.Unlock()
	if e.tasks.db == nil {
		// As with the table: an event of a rolled-back transaction never happened.
		e.tx.AfterCommit(ctx, func(context.Context) {
			e.mu.Lock()
			e.published = append(e.published, ev)
			e.mu.Unlock()
		})
	}
	if len(subs) == 0 {
		return nil
	}
	return e.tx.Do(ctx, func(ctx context.Context) error {
		for _, sub := range subs {
			if err := e.tasks.Enqueue(ctx, "event:"+sub, ev); err != nil {
				return err
			}
		}
		return nil
	})
}

// Published is what was published without a database — for tests (kerneltest).
func (e *EventsSlot) Published() []Event {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]Event(nil), e.published...)
}
