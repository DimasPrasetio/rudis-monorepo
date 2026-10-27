package kernel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

func memoryDeps(t *testing.T) (*TasksSlot, *EventsSlot) {
	t.Helper()
	tx := NewTxSlot(nil, quietLog())
	tasks := NewTasksSlot(nil, tx, nil, nil, NewClock(nil), quietLog())
	return tasks, NewEventsSlot(tasks, tx, NewClock(nil))
}

func TestEventsReachEverySubscriberThroughTasks(t *testing.T) {
	tasks, events := memoryDeps(t)
	var got []string
	type posted struct {
		Number string `json:"number"`
	}
	for _, sub := range []string{"ledger.post", "notify.tell"} {
		events.On("sales.invoice.posted", sub, func(_ context.Context, ev Event) error {
			var p posted
			if err := json.Unmarshal(ev.Payload, &p); err != nil {
				return err
			}
			got = append(got, sub+":"+p.Number+":"+ev.Name)
			return nil
		})
	}
	if err := events.Publish(context.Background(), "sales.invoice.posted", 1, map[string]string{"number": "INV-1"}); err != nil {
		t.Fatal(err)
	}
	if err := events.Publish(context.Background(), "sales.order.cancelled", 1, nil); err != nil {
		t.Fatal(err) // no subscriber: nothing to deliver
	}
	if n, err := tasks.RunPending(context.Background()); err != nil || n != 2 {
		t.Fatalf("ran %d, err %v", n, err)
	}
	if len(got) != 2 || got[0] != "ledger.post:INV-1:sales.invoice.posted" {
		t.Fatalf("deliveries = %v", got)
	}
	if len(events.Published()) != 2 {
		t.Fatalf("published = %v", events.Published())
	}
}

func TestEventsRefuseBadNames(t *testing.T) {
	_, events := memoryDeps(t)
	if err := events.Publish(context.Background(), "Invoice Posted", 1, nil); err == nil {
		t.Fatal("a bad event name was published")
	}
	defer func() {
		if recover() == nil {
			t.Fatal("a bad subscriber name was accepted")
		}
	}()
	events.On("sales.invoice.posted", "nomodule", func(context.Context, Event) error { return nil })
}

func TestTasksRefuseUnknownKindsAndRegisteringLate(t *testing.T) {
	tasks, _ := memoryDeps(t)
	if err := tasks.Enqueue(context.Background(), "x.missing", nil); err == nil {
		t.Fatal("an unregistered kind was enqueued")
	}
	tasks.Register("x.ok", func(context.Context, Task) error { return errors.New("boom") }, TaskKind{})
	_ = tasks.Enqueue(context.Background(), "x.ok", nil)
	if _, err := tasks.RunPending(context.Background()); err == nil {
		t.Fatal("a failing task did not report")
	}
	tasks.Start(context.Background())
	defer func() {
		if recover() == nil {
			t.Fatal("registered after start")
		}
	}()
	tasks.Register("x.late", func(context.Context, Task) error { return nil }, TaskKind{})
}

func TestMemoryTasksBehaveLikeTheTable(t *testing.T) {
	tasks, events := memoryDeps(t)
	tx := tasks.tx
	var ran []string
	tasks.Register("test.note", func(ctx context.Context, task Task) error {
		ran = append(ran, string(task.Payload)+":"+map[bool]string{true: "tx", false: "no-tx"}[tx.InTx(ctx)])
		return nil
	}, TaskKind{})
	tasks.Register("test.send", func(ctx context.Context, task Task) error {
		ran = append(ran, "send:"+map[bool]string{true: "tx", false: "no-tx"}[tx.InTx(ctx)])
		return nil
	}, TaskKind{NonTransactional: true})
	ctx := context.Background()
	_ = tx.Do(ctx, func(ctx context.Context) error {
		_ = tasks.Enqueue(ctx, "test.note", "rolled-back")
		_ = events.Publish(ctx, "sales.invoice.voided", 1, nil)
		return errors.New("rolled back")
	})
	if len(tasks.Pending()) != 0 || len(events.Published()) != 0 {
		t.Fatalf("a rolled-back transaction left work: %v %v", tasks.Pending(), events.Published())
	}
	_ = tasks.Enqueue(ctx, "test.note", "a", Dedupe("k"))
	_ = tasks.Enqueue(ctx, "test.note", "b", Dedupe("k")) // a duplicate while the first waits
	_ = tasks.Enqueue(ctx, "test.send", nil)
	if n, err := tasks.RunPending(ctx); err != nil || n != 2 {
		t.Fatalf("ran %d, err %v", n, err)
	}
	if len(ran) != 2 || ran[0] != `"a":tx` || ran[1] != "send:no-tx" {
		t.Fatalf("ran = %v", ran)
	}
}

func TestTasksRunInTheScopeTheyWereEnqueuedIn(t *testing.T) {
	tasks, _ := memoryDeps(t)
	var got []string
	tasks.Register("test.scope", func(ctx context.Context, task Task) error {
		got = append(got, fmt.Sprintf("%v:%d:%d", HasScope(ctx), ScopeFrom(ctx).CompanyID, ScopeFrom(ctx).BranchID))
		return nil
	}, TaskKind{})
	ctx := context.Background()
	_ = tasks.Enqueue(ctx, "test.scope", nil)                                              // a job, a public route
	_ = tasks.Enqueue(WithScope(ctx, Scope{CompanyID: 2, BranchID: 5}), "test.scope", nil) // a signed-in request
	if _, err := tasks.RunPending(ctx); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "false:1:0" || got[1] != "true:2:5" {
		t.Fatalf("scopes = %v", got)
	}
}
