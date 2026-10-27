-- Kernel 6: the tables the kernel itself owns (no module may touch kernel_*).
-- Times are DATETIME(6) holding UTC (every session runs in UTC).

-- Durable background tasks (d.Tasks) — also every event delivery (d.Events).
CREATE TABLE kernel_tasks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  kind VARCHAR(100) NOT NULL,
  lane VARCHAR(10) NOT NULL,
  status VARCHAR(10) NOT NULL,
  payload JSON NOT NULL,
  envelope JSON NOT NULL,
  dedupe_key VARCHAR(191) NULL,
  dedupe_active VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN status = 'ready' THEN dedupe_key END) STORED,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL,
  run_at DATETIME(6) NOT NULL,
  locked_until DATETIME(6) NULL,
  lease_token CHAR(32) NULL,
  last_error VARCHAR(1000) NOT NULL DEFAULT '',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY kernel_tasks_dedupe (kind, dedupe_active),
  KEY kernel_tasks_due (lane, status, run_at),
  KEY kernel_tasks_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Calendar schedules (d.Jobs.Daily/Weekly/Monthly): their state, for the administrator's view.
CREATE TABLE kernel_schedules (
  name VARCHAR(100) NOT NULL,
  spec VARCHAR(50) NOT NULL,
  last_success_at DATETIME(6) NULL,
  failures INT NOT NULL DEFAULT 0,
  first_failure_at DATETIME(6) NULL,
  last_error VARCHAR(1000) NOT NULL DEFAULT '',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per tick that ran: the container that inserts it runs the tick.
CREATE TABLE kernel_schedule_runs (
  name VARCHAR(100) NOT NULL,
  scheduled_for DATETIME(6) NOT NULL,
  started_at DATETIME(6) NOT NULL,
  finished_at DATETIME(6) NULL,
  ok BOOLEAN NULL,
  error VARCHAR(1000) NOT NULL DEFAULT '',
  PRIMARY KEY (name, scheduled_for)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
