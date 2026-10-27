// Package database opens the connection pool to the host's shared MySQL.
package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"reflect"
	"time"

	"github.com/go-sql-driver/mysql"
)

// Options adjust how the pool is opened.
type Options struct {
	// Wrap wraps the driver connector — where a metrics or tracing kit hooks into every query.
	// Set in cmd/server/main.go: the pool opens before any module is built.
	Wrap func(driver.Connector) driver.Connector
}

// Open returns the pool without dialing: the API starts even while MySQL is down, and
// /readyz reports it until it answers — deploy.sh and the image HEALTHCHECK wait on that.
func Open(dsn string) (*sql.DB, error) { return OpenWith(dsn, Options{}) }

// OpenWith is Open with options.
func OpenWith(dsn string, o Options) (*sql.DB, error) {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DB_DSN: %w", err)
	}
	// sqlc scans DATETIME/TIMESTAMP columns into time.Time, which needs parseTime. Set here
	// rather than in DB_DSN, because golang-migrate reads the same variable.
	cfg.ParseTime = true
	// Every session runs in UTC whatever the host MySQL's time zone is, matching the driver's
	// default Loc (UTC). Without it, TIMESTAMP columns written and read through a server set
	// to WIB shift by seven hours. Day boundaries ("today" for a cashier) are computed in
	// Asia/Jakarta explicitly, in code.
	if cfg.Params == nil {
		cfg.Params = map[string]string{}
	}
	cfg.Params["time_zone"] = "'+00:00'"

	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	var c driver.Connector = watchedConnector{connector}
	if o.Wrap != nil {
		c = o.Wrap(c)
	}
	db := sql.OpenDB(c)
	// A small shared server: keep the pool modest, and recycle connections well before
	// MySQL's wait_timeout closes them from the other side.
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	return db, nil
}

// Name is the database DB_DSN points at — what names this app's MySQL locks on a shared server.
func Name(dsn string) string {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return ""
	}
	return cfg.DBName
}

// Retryable reports whether err is MySQL giving up on a transaction that may succeed when run
// again: a deadlock (1213, the transaction was rolled back) or a lock wait timeout (1205, only
// the statement was — the caller must roll back the rest before retrying).
func Retryable(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && (me.Number == 1213 || me.Number == 1205)
}

// Ping reports whether the database answers within timeout.
func Ping(ctx context.Context, db *sql.DB, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return db.PingContext(ctx)
}

// Watcher sees every statement run with a ctx that carries it (WithWatcher): Before may refuse
// the statement, After sees its error — also one that surfaces only while rows are read. d.Tx
// watches its transaction this way, so one MySQL already ended (a deadlock) fails however the
// error reached the code, and nothing runs on it afterwards.
type Watcher interface {
	Before() error
	After(err error)
}

type watcherKey struct{}

// WithWatcher returns ctx carrying w.
func WithWatcher(ctx context.Context, w Watcher) context.Context {
	return context.WithValue(ctx, watcherKey{}, w)
}

func watcherFrom(ctx context.Context) Watcher {
	w, _ := ctx.Value(watcherKey{}).(Watcher)
	return w
}

// before asks ctx's watcher whether a statement may run.
func before(ctx context.Context) (Watcher, error) {
	w := watcherFrom(ctx)
	if w == nil {
		return nil, nil
	}
	return w, w.Before()
}

func after(w Watcher, err error) {
	if w != nil && err != nil && !errors.Is(err, driver.ErrSkip) && !errors.Is(err, io.EOF) {
		w.After(err)
	}
}

// The wrappers below pass every call through to the MySQL driver, adding only the watcher.

type watchedConnector struct{ driver.Connector }

func (c watchedConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	return &watchedConn{conn}, nil
}

type watchedConn struct{ driver.Conn }

func (c *watchedConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	w, err := before(ctx)
	if err != nil {
		return nil, err
	}
	var stmt driver.Stmt
	if p, ok := c.Conn.(driver.ConnPrepareContext); ok {
		stmt, err = p.PrepareContext(ctx, query)
	} else {
		stmt, err = c.Conn.Prepare(query)
	}
	after(w, err)
	if err != nil {
		return nil, err
	}
	return &watchedStmt{stmt}, nil
}

func (c *watchedConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if b, ok := c.Conn.(driver.ConnBeginTx); ok {
		return b.BeginTx(ctx, opts)
	}
	return c.Conn.Begin() // drivers without BeginTx; MySQL's has it
}

func (c *watchedConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	e, ok := c.Conn.(driver.ExecerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	w, err := before(ctx)
	if err != nil {
		return nil, err
	}
	r, err := e.ExecContext(ctx, query, args)
	after(w, err)
	return r, err
}

func (c *watchedConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	q, ok := c.Conn.(driver.QueryerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	w, err := before(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := q.QueryContext(ctx, query, args)
	after(w, err)
	if err != nil {
		return nil, err
	}
	return &watchedRows{Rows: rows, w: w}, nil
}

func (c *watchedConn) Ping(ctx context.Context) error {
	if p, ok := c.Conn.(driver.Pinger); ok {
		return p.Ping(ctx)
	}
	return nil
}

func (c *watchedConn) ResetSession(ctx context.Context) error {
	if r, ok := c.Conn.(driver.SessionResetter); ok {
		return r.ResetSession(ctx)
	}
	return nil
}

func (c *watchedConn) IsValid() bool {
	if v, ok := c.Conn.(driver.Validator); ok {
		return v.IsValid()
	}
	return true
}

func (c *watchedConn) CheckNamedValue(nv *driver.NamedValue) error {
	if n, ok := c.Conn.(driver.NamedValueChecker); ok {
		return n.CheckNamedValue(nv)
	}
	return driver.ErrSkip
}

type watchedStmt struct{ driver.Stmt }

func (s *watchedStmt) ExecContext(ctx context.Context, args []driver.NamedValue) (driver.Result, error) {
	w, err := before(ctx) // database/sql passes the caller's ctx
	if err != nil {
		return nil, err
	}
	e, ok := s.Stmt.(driver.StmtExecContext)
	if !ok {
		return nil, errors.New("database: driver statement without ExecContext")
	}
	r, err := e.ExecContext(ctx, args)
	after(w, err)
	return r, err
}

func (s *watchedStmt) QueryContext(ctx context.Context, args []driver.NamedValue) (driver.Rows, error) {
	w, err := before(ctx)
	if err != nil {
		return nil, err
	}
	q, ok := s.Stmt.(driver.StmtQueryContext)
	if !ok {
		return nil, errors.New("database: driver statement without QueryContext")
	}
	rows, err := q.QueryContext(ctx, args)
	after(w, err)
	if err != nil {
		return nil, err
	}
	return &watchedRows{Rows: rows, w: w}, nil
}

func (s *watchedStmt) CheckNamedValue(nv *driver.NamedValue) error {
	if n, ok := s.Stmt.(driver.NamedValueChecker); ok {
		return n.CheckNamedValue(nv)
	}
	return driver.ErrSkip
}

type watchedRows struct {
	driver.Rows
	w Watcher
}

func (r *watchedRows) Next(dest []driver.Value) error {
	err := r.Rows.Next(dest)
	after(r.w, err)
	return err
}

func (r *watchedRows) HasNextResultSet() bool {
	n, ok := r.Rows.(driver.RowsNextResultSet)
	return ok && n.HasNextResultSet()
}

func (r *watchedRows) NextResultSet() error {
	if n, ok := r.Rows.(driver.RowsNextResultSet); ok {
		err := n.NextResultSet()
		after(r.w, err)
		return err
	}
	return io.EOF
}

func (r *watchedRows) ColumnTypeScanType(i int) reflect.Type {
	if c, ok := r.Rows.(driver.RowsColumnTypeScanType); ok {
		return c.ColumnTypeScanType(i)
	}
	return reflect.TypeFor[any]()
}

func (r *watchedRows) ColumnTypeDatabaseTypeName(i int) string {
	if c, ok := r.Rows.(driver.RowsColumnTypeDatabaseTypeName); ok {
		return c.ColumnTypeDatabaseTypeName(i)
	}
	return ""
}

func (r *watchedRows) ColumnTypeNullable(i int) (nullable, ok bool) {
	if c, ok := r.Rows.(driver.RowsColumnTypeNullable); ok {
		return c.ColumnTypeNullable(i)
	}
	return false, false
}

func (r *watchedRows) ColumnTypePrecisionScale(i int) (precision, scale int64, ok bool) {
	if c, ok := r.Rows.(driver.RowsColumnTypePrecisionScale); ok {
		return c.ColumnTypePrecisionScale(i)
	}
	return 0, 0, false
}

func (r *watchedRows) ColumnTypeLength(i int) (length int64, ok bool) {
	if c, ok := r.Rows.(driver.RowsColumnTypeLength); ok {
		return c.ColumnTypeLength(i)
	}
	return 0, false
}
