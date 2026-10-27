// Package config loads the API's settings from the environment once, at startup.
package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strings"
	"time"
)

// Config holds only the settings the kernel itself needs. A module reads its own settings
// (e.g. JWT_SECRET for auth) with Get or Require, so adding a module never edits this struct.
type Config struct {
	Env       string // APP_ENV: development | production
	Port      string // APP_PORT
	Name      string // APP_NAME
	DBDSN     string // DB_DSN: user:pass@tcp(host:port)/db — no scheme prefix
	PublicDir string // PUBLIC_DIR: built SPA served by the container; empty in dev
	// DataDir (DATA_DIR) is the one folder the app writes to — uploads and anything else that
	// must outlive a deploy. /app/data in the image (a volume on the server); "data" in dev,
	// relative to apps/api. A module keeps its files in DataDir/<module>/.
	DataDir string
	// Location (APP_TIMEZONE, default Asia/Jakarta) is where business dates and calendar
	// schedules are counted. Instants are stored in UTC either way.
	Location *time.Location
	// TrustedProxies (TRUSTED_PROXIES, comma-separated CIDRs) are the hops allowed to say who
	// the client is through X-Forwarded-For — on the server, the host nginx over the docker bridge.
	TrustedProxies []netip.Prefix
}

// Load reads the kernel settings and fails on the ones the API cannot start without.
func Load() (*Config, error) {
	c := &Config{
		Env:       Get("APP_ENV", "development"),
		Port:      Get("APP_PORT", "8080"),
		Name:      Get("APP_NAME", "api"),
		DBDSN:     Get("DB_DSN", ""),
		PublicDir: Get("PUBLIC_DIR", ""),
		DataDir:   Get("DATA_DIR", "data"),
	}
	tz := Get("APP_TIMEZONE", "Asia/Jakarta")
	loc, err := time.LoadLocation(tz)
	if err != nil || tz == "Local" {
		return nil, fmt.Errorf("APP_TIMEZONE must be an IANA time zone such as Asia/Jakarta (got %q)", tz)
	}
	c.Location = loc
	if c.DBDSN == "" {
		return nil, errors.New("DB_DSN is not set — copy .env.example to .env at the repo root")
	}
	if c.Env != "development" && c.Env != "production" {
		return nil, fmt.Errorf("APP_ENV must be development or production (got %q)", c.Env)
	}
	// The image sets PUBLIC_DIR. A container without an explicit APP_ENV would otherwise run
	// with development defaults (no Secure cookie, weak secrets accepted).
	if c.PublicDir != "" && os.Getenv("APP_ENV") == "" {
		return nil, errors.New("APP_ENV is not set — set APP_ENV=production in the server's .env")
	}
	for _, cidr := range strings.Split(Get("TRUSTED_PROXIES", ""), ",") {
		if cidr = strings.TrimSpace(cidr); cidr == "" {
			continue
		}
		p, err := netip.ParsePrefix(cidr)
		if err != nil {
			return nil, fmt.Errorf("TRUSTED_PROXIES: %q is not a CIDR such as 172.16.0.0/12", cidr)
		}
		c.TrustedProxies = append(c.TrustedProxies, p.Masked())
	}
	return c, nil
}

// IsProduction reports whether the API runs in the deployed container.
func (c *Config) IsProduction() bool { return c.Env == "production" }

// Get returns the value of key, or fallback when it is unset or empty.
func Get(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Require returns the value of key, or an error naming it — for a setting a module cannot
// run without. Call it in the module's New so a missing value stops the API at startup.
func Require(key string) (string, error) {
	if v := os.Getenv(key); v != "" {
		return v, nil
	}
	return "", fmt.Errorf("%s is not set", key)
}
