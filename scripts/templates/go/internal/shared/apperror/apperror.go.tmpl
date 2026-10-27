// Package apperror is the one error type a handler returns for the client to see. Any other
// error that reaches response.Error is logged and answered as a generic 500, so internals
// never leak into a response.
package apperror

import (
	"errors"
	"net/http"
)

// Error is a client-facing error: Status and Message are sent, Details becomes the
// envelope's "errors", and Err is the internal cause — logged, never sent.
type Error struct {
	Status  int
	Message string
	Details any
	Err     error
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *Error) Unwrap() error { return e.Err }

// New returns an error with any status.
func New(status int, message string) *Error {
	return &Error{Status: status, Message: message}
}

func BadRequest(message string) *Error   { return New(http.StatusBadRequest, message) }
func Unauthorized(message string) *Error { return New(http.StatusUnauthorized, message) }
func Forbidden(message string) *Error    { return New(http.StatusForbidden, message) }
func NotFound(message string) *Error     { return New(http.StatusNotFound, message) }
func Conflict(message string) *Error     { return New(http.StatusConflict, message) }

// Validation is a 422 whose details list what was wrong with the input.
func Validation(details any) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Message: "Data tidak valid", Details: details}
}

// Internal wraps an unexpected failure. Only the generic message reaches the client.
func Internal(err error) *Error {
	return &Error{Status: http.StatusInternalServerError, Message: "Terjadi kesalahan pada server", Err: err}
}

// As returns err as an *Error if one is in its chain.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
