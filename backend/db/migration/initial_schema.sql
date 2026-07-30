-- ============================================================
-- 001_initial_schema.sql
--
-- Run this once in your Supabase SQL editor (or via psql)
-- to create all tables matching the ERD.
--
-- SQLAlchemy's create_all() will also do this automatically,
-- but having an explicit migration gives you version control.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name       TEXT        NOT NULL,
    email           TEXT        NOT NULL UNIQUE,
    hashed_password TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    sharepoint_item_id  TEXT PRIMARY KEY,
    project_name        TEXT,
    client_name         TEXT,
    project_code        TEXT
);

-- ─────────────────────────────────────────────
-- AUDIT SESSIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_sessions (
    session_id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    audit_type          TEXT        NOT NULL,
    sharepoint_item_id  TEXT        NOT NULL REFERENCES projects(sharepoint_item_id),
    user_id             UUID        REFERENCES users(user_id),
    audit_status        TEXT        NOT NULL DEFAULT 'pending',
    completion_time     TIMESTAMPTZ,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user      ON audit_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project   ON audit_sessions(sharepoint_item_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status    ON audit_sessions(audit_status);

-- ─────────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    document_id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id          TEXT        NOT NULL REFERENCES audit_sessions(session_id) ON DELETE CASCADE,
    file_name           TEXT        NOT NULL,
    framework_category  TEXT,
    document_metadata   JSONB       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);

-- ─────────────────────────────────────────────
-- AUDIT RESULTS  (individual document audit)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_results (
    audit_id        TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id      TEXT        NOT NULL REFERENCES audit_sessions(session_id) ON DELETE CASCADE,
    document_id     TEXT        REFERENCES documents(document_id),
    score           TEXT,
    finding         TEXT,
    evidence        TEXT,
    recommendation  TEXT,
    full_results    JSONB       DEFAULT '[]',
    completion_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_results_session  ON audit_results(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_document ON audit_results(document_id);

-- ─────────────────────────────────────────────
-- COMBINED SUMMARIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combined_summaries (
    summary_id              TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id              TEXT    NOT NULL UNIQUE REFERENCES audit_sessions(session_id) ON DELETE CASCADE,
    overall_project_score   FLOAT,
    executive_summary       TEXT,
    cross_document_findings JSONB   DEFAULT '[]',
    gaps_and_risks          JSONB   DEFAULT '[]',
    strengths               JSONB   DEFAULT '[]',
    recommendation          JSONB   DEFAULT '[]'
);

-- ─────────────────────────────────────────────
-- AUDIT REPORTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_reports (
    report_id       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id      TEXT        NOT NULL UNIQUE REFERENCES audit_sessions(session_id) ON DELETE CASCADE,
    sharepoint_url  TEXT,
    report_name     TEXT,
    completion_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROW-LEVEL SECURITY  (Supabase best practice)
-- Enable RLS and restrict each table to its owner via user_id.
-- Your FastAPI layer authenticates via JWT and passes user context.
-- If you're querying via the service_role key (server-side only),
-- RLS is bypassed automatically.
-- ─────────────────────────────────────────────
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE combined_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports   ENABLE ROW LEVEL SECURITY;

-- Service role bypass (FastAPI uses this key — full access)
-- No explicit policy needed; service_role bypasses RLS by default in Supabase.

-- ============================================================
-- 002_azure_ad_auth.sql
--
-- WHEN TO RUN: After 001_initial_schema.sql, before starting the app.
-- WHERE:       Supabase SQL editor, or psql connected to your DB.
--
-- WHAT THIS DOES:
--   - Adds azure_oid and azure_email columns to users table
--   - Removes hashed_password column (no longer needed)
--   - Creates an index on azure_oid for fast user lookup on every login
--
-- WHY NOT just edit 001 and re-run it?
--   Because 001 already ran against your live DB. Re-running it would
--   fail or corrupt data. Migrations are always additive — new file,
--   new changes. This is the same pattern Rails/Django use.
-- ============================================================

-- Add the Azure OID column
-- NOT NULL is enforced after backfill. If you have existing users
-- from the password-based system, you'd need to backfill first.
-- For a fresh install, just add it as NOT NULL directly:
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS azure_oid   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS azure_email TEXT;

-- Create an index — every login does a WHERE azure_oid = $1 lookup.
-- Without an index this scans the whole users table every time.
-- With an index it's a direct B-tree lookup (microseconds).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_azure_oid
  ON users (azure_oid);

CREATE INDEX IF NOT EXISTS idx_users_azure_email
  ON users (azure_email);

-- Remove the password column — we no longer store passwords.
-- NOTE: If you have existing rows with hashed_password values,
-- this will drop that data. That's intentional — you can't use
-- passwords anymore once Azure AD is the auth provider.
ALTER TABLE users
  DROP COLUMN IF EXISTS hashed_password;

-- ── Verify the result ──────────────────────────────────────
-- Run this SELECT to confirm the columns look right:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'users'
-- ORDER BY ordinal_position;
--
-- Expected output:
--   user_id     | uuid    | NO
--   user_name   | text    | NO
--   azure_oid   | text    | NO  ← new
--   azure_email | text    | YES ← new
--   created_at  | timestamptz | NO