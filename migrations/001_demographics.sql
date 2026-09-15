-- Safe to run repeatedly. Existing sessions and ratings are retained.
CREATE TABLE IF NOT EXISTS session_demographics (
  session_id TEXT PRIMARY KEY,
  gender TEXT NOT NULL CHECK (gender IN ('男', '女')),
  age INTEGER NOT NULL CHECK (age BETWEEN 1 AND 120),
  updated_at TEXT NOT NULL
);
