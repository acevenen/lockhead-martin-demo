-- Rory operational store. Local-first SQLite (node:sqlite). Idempotent:
-- every statement is CREATE ... IF NOT EXISTS, so migrate() can run repeatedly.
-- JSON columns hold structured sub-objects; the app validates them against the
-- contracts in ../contracts before writing.

-- Append-only event ledger. The app never UPDATEs or DELETEs this table;
-- derived state can be rebuilt from it. `seq` gives a total order.
CREATE TABLE IF NOT EXISTS events (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  id           TEXT UNIQUE NOT NULL,
  type         TEXT NOT NULL,
  actor        TEXT NOT NULL,
  subject_type TEXT,
  subject_id   TEXT,
  payload      TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_subject ON events (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS tasks (
  id                      TEXT PRIMARY KEY,
  parent_goal             TEXT,
  parent_task             TEXT,
  objective               TEXT NOT NULL,
  acceptance_criteria     TEXT NOT NULL DEFAULT '[]',
  scope                   TEXT,
  exclusions              TEXT NOT NULL DEFAULT '[]',
  priority                INTEGER NOT NULL DEFAULT 50,
  risk                    TEXT NOT NULL DEFAULT 'low',
  required_capabilities   TEXT NOT NULL DEFAULT '[]',
  allowed_tools           TEXT NOT NULL DEFAULT '[]',
  memory_scopes           TEXT NOT NULL DEFAULT '[]',
  budget                  TEXT NOT NULL DEFAULT '{}',
  assigned_agent          TEXT,
  reviewer                TEXT,
  dependencies            TEXT NOT NULL DEFAULT '[]',
  status                  TEXT NOT NULL DEFAULT 'proposed',
  evidence                TEXT NOT NULL DEFAULT '[]',
  failure                 TEXT,
  recommended_next_action TEXT,
  delegation_depth        INTEGER NOT NULL DEFAULT 0,
  retries                 INTEGER NOT NULL DEFAULT 0,
  lease_expires_at        TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks (parent_goal);

CREATE TABLE IF NOT EXISTS artifacts (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL,
  path_or_uri     TEXT,
  type            TEXT NOT NULL,
  authoring_agent TEXT NOT NULL,
  content_hash    TEXT,
  review_state    TEXT NOT NULL DEFAULT 'unreviewed',
  verification    TEXT NOT NULL DEFAULT '{}',
  sensitivity     TEXT NOT NULL DEFAULT 'internal',
  retention       TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts (task_id);

CREATE TABLE IF NOT EXISTS memories (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'global',
  subject          TEXT NOT NULL,
  content          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'proposed',
  source_type      TEXT NOT NULL,
  source_reference TEXT,
  created_by       TEXT NOT NULL,
  confidence       TEXT NOT NULL DEFAULT 'stated',
  sensitivity      TEXT NOT NULL DEFAULT 'internal',
  valid_from       TEXT,
  valid_until      TEXT,
  supersedes       TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  approval_required INTEGER NOT NULL DEFAULT 0,
  approved_by      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories (status);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories (scope);

-- Full-text retrieval over durable memory (FTS5). Kept in sync by the memory
-- repository. Semantic embeddings are an OPTIONAL, rebuildable index added
-- later behind an interface (ADR-0004) — not required here.
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED, subject, content, tags
);

CREATE TABLE IF NOT EXISTS memory_proposals (
  id          TEXT PRIMARY KEY,
  memory      TEXT NOT NULL,
  proposer    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  reason      TEXT,
  decided_by  TEXT,
  decided_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON memory_proposals (status);

CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,
  manifest    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  version     TEXT NOT NULL DEFAULT '0.1.0',
  source_hash TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  review_id      TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,
  artifact_ids   TEXT NOT NULL DEFAULT '[]',
  worker_agent   TEXT NOT NULL,
  reviewer_agent TEXT NOT NULL,
  criteria       TEXT NOT NULL DEFAULT '[]',
  findings       TEXT NOT NULL DEFAULT '[]',
  evidence       TEXT NOT NULL DEFAULT '[]',
  decision       TEXT NOT NULL,
  required_changes TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_task ON reviews (task_id);

CREATE TABLE IF NOT EXISTS lessons (
  id                    TEXT PRIMARY KEY,
  trigger_conditions    TEXT NOT NULL,
  scopes                TEXT NOT NULL DEFAULT '[]',
  tags                  TEXT NOT NULL DEFAULT '[]',
  prevention_instruction TEXT NOT NULL,
  enforcement_mechanism TEXT,
  regression_check      TEXT,
  evidence              TEXT NOT NULL DEFAULT '[]',
  confidence            TEXT NOT NULL DEFAULT 'uncertain',
  status                TEXT NOT NULL DEFAULT 'proposed',
  supersedes            TEXT,
  last_verified         TEXT,
  owner                 TEXT,
  task_type             TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons (status);

CREATE TABLE IF NOT EXISTS failures (
  id                   TEXT PRIMARY KEY,
  task_id              TEXT,
  run_id               TEXT,
  symptom              TEXT NOT NULL,
  impact               TEXT,
  evidence             TEXT NOT NULL DEFAULT '[]',
  root_cause_status    TEXT NOT NULL DEFAULT 'unknown',
  likely_root_cause    TEXT,
  contributing_factors TEXT NOT NULL DEFAULT '[]',
  recurrent            INTEGER NOT NULL DEFAULT 0,
  containment          TEXT,
  proposed_prevention  TEXT,
  owner                TEXT,
  verification_state   TEXT NOT NULL DEFAULT 'not_run',
  lesson_id            TEXT,
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id                    TEXT PRIMARY KEY,
  task_id               TEXT NOT NULL,
  selected_agent        TEXT NOT NULL,
  selected_model_profile TEXT NOT NULL,
  constraints           TEXT NOT NULL DEFAULT '[]',
  alternatives_considered TEXT NOT NULL DEFAULT '[]',
  decision_summary      TEXT NOT NULL,
  policy_version        TEXT NOT NULL DEFAULT '0.1.0',
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routing_task ON routing_decisions (task_id);

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  model_profile TEXT,
  provider      TEXT,
  status        TEXT NOT NULL DEFAULT 'running',
  tokens        TEXT NOT NULL DEFAULT '{}',
  cost_usd      REAL,
  error         TEXT,
  started_at    TEXT NOT NULL,
  ended_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON runs (task_id);

CREATE TABLE IF NOT EXISTS handoffs (
  handoff_id TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  envelope   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_handoffs_task ON handoffs (task_id);
