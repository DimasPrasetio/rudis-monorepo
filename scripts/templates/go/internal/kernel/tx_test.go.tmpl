package kernel

import (
	"context"
	"errors"
	"testing"

	"github.com/go-sql-driver/mysql"
)

func TestTxJoinsAndRunsHooksAfterTheOutermost(t *testing.T) {
	tx := NewTxSlot(nil, quietLog())
	var order []string
	err := tx.Do(context.Background(), func(ctx context.Context) error {
		if !tx.InTx(ctx) {
			t.Fatal("no transaction in ctx")
		}
		tx.AfterCommit(ctx, func(context.Context) { order = append(order, "hook") })
		return tx.Do(ctx, func(ctx context.Context) error {
			tx.AfterCommit(ctx, func(context.Context) { order = append(order, "inner hook") })
			order = append(order, "inner")
			return nil
		})
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := len(order); got != 3 || order[0] != "inner" || order[1] != "hook" || order[2] != "inner hook" {
		t.Fatalf("order = %v", order)
	}
}

func TestTxDropsHooksWhenFnFails(t *testing.T) {
	tx := NewTxSlot(nil, quietLog())
	ran := false
	boom := errors.New("boom")
	err := tx.Do(context.Background(), func(ctx context.Context) error {
		tx.AfterCommit(ctx, func(context.Context) { ran = true })
		return boom
	})
	if !errors.Is(err, boom) || ran {
		t.Fatalf("err=%v hook ran=%v", err, ran)
	}
}

func TestAfterCommitOutsideATransactionRunsAtOnce(t *testing.T) {
	tx := NewTxSlot(nil, quietLog())
	ran := false
	tx.AfterCommit(context.Background(), func(context.Context) { ran = true })
	if !ran || tx.InTx(context.Background()) {
		t.Fatal("hook did not run at once")
	}
}

func TestTxRefusesStatementsOnceTheTransactionIsGone(t *testing.T) {
	st := &txState{}
	deadlock := &mysql.MySQLError{Number: 1213, Message: "Deadlock found"}
	st.After(errors.New("duplicate entry")) // an ordinary error leaves the transaction usable
	if st.Before() != nil {
		t.Fatal("an ordinary error latched the transaction")
	}
	st.After(deadlock)
	if err := st.Before(); !errors.Is(err, deadlock) {
		t.Fatalf("a statement after the deadlock may run: %v", err)
	}
}
