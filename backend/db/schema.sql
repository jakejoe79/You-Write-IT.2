CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  mode TEXT NOT NULL,
  genre TEXT,
  author_style TEXT,
  protagonist TEXT,
  state TEXT,           -- JSON: emotion, characters, inventory, choices, world_rules
  last_event TEXT,      -- JSON: last SSE event for resume
  streaming INTEGER DEFAULT 0,  -- 1 if currently streaming
  last_activity DATETIME,       -- last activity timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  parent_branch_id TEXT,        -- NULL for root branch
  fork_chapter_index INTEGER,   -- which chapter this branch forked from
  name TEXT,                    -- optional branch name (e.g., "Fight the monster")
  state_snapshot TEXT,          -- JSON: complete state at fork point
  is_checkpoint BOOLEAN DEFAULT 0,  -- 1 if this is a state checkpoint
  checkpoint_depth INTEGER,     -- depth from root (for optimization)
  emotion_trajectory TEXT,      -- JSON: { fear: 'rising', hope: 'falling', ... }
  personality TEXT,             -- human-readable branch personality
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  chapter_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  emotion TEXT,         -- JSON emotion state at generation time
  validation TEXT,      -- continuity validation result
  status TEXT DEFAULT 'complete',  -- 'complete', 'incomplete', 'edited'
  last_edited DATETIME, -- timestamp of last edit
  derived_from INTEGER, -- if recomputed, the original chapter index
  extracted_state TEXT, -- JSON: extracted characters, inventory, deadCharacters for edited chapters
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id),
  content TEXT NOT NULL,
  emotion TEXT,         -- JSON emotion state at revision time
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapters_session ON chapters(session_id, branch_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_chapters_branch ON chapters(branch_id);
CREATE INDEX IF NOT EXISTS idx_branches_session ON branches(session_id);
CREATE INDEX IF NOT EXISTS idx_branches_parent ON branches(parent_branch_id);
CREATE INDEX IF NOT EXISTS idx_revisions_chapter ON revisions(chapter_id);