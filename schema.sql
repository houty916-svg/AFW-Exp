CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  order_json TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(subject_id, updated_at);
CREATE TABLE IF NOT EXISTS responses (
  session_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  trial_order INTEGER NOT NULL,
  image TEXT NOT NULL,
  fear_rating_0_100 INTEGER NOT NULL,
  rt_ms INTEGER,
  timestamp TEXT,
  total_trials INTEGER,
  PRIMARY KEY (session_id, trial_order)
);
CREATE INDEX IF NOT EXISTS idx_responses_subject ON responses(subject_id);

-- Safe to run repeatedly. Existing sessions and ratings are retained.
CREATE TABLE IF NOT EXISTS session_demographics (
  session_id TEXT PRIMARY KEY,
  gender TEXT NOT NULL CHECK (gender IN ('男', '女')),
  age INTEGER NOT NULL CHECK (age BETWEEN 1 AND 120),
  updated_at TEXT NOT NULL
);
