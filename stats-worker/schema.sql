CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,          -- milliseconds since epoch (UTC)
  type TEXT NOT NULL,           -- view | click | copy
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  device TEXT,                  -- Mobile | Tablet | Desktop
  browser TEXT,
  os TEXT,
  source TEXT,                  -- where a view came from (views only)
  link_title TEXT,              -- clicks and copies only
  link_url TEXT
);

CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_type_ts ON events (type, ts);
