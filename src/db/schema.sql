-- Clinical Pathway Drill Game Database Schema

-- Clinical Pathways
CREATE TABLE IF NOT EXISTS paths (
    path_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')) NOT NULL,
    admission_criteria_json TEXT,
    start_node_id TEXT,
    data_json TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Game Attempts
CREATE TABLE IF NOT EXISTS attempts (
    attempt_id TEXT PRIMARY KEY,
    path_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    current_node_id TEXT,
    score INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    remaining_time INTEGER,
    difficulty TEXT,
    FOREIGN KEY (path_id) REFERENCES paths(path_id)
);

-- Node Logs (choices made during attempt)
CREATE TABLE IF NOT EXISTS node_logs (
    log_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    choice_id TEXT NOT NULL,
    time_spent INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id)
);

-- Scores Summary
CREATE TABLE IF NOT EXISTS scores (
    attempt_id TEXT PRIMARY KEY,
    total_score INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    time_bonus INTEGER NOT NULL,
    difficulty_bonus INTEGER NOT NULL,
    completed INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    total_count INTEGER NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id)
);

-- Players
CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attempts_path_id ON attempts(path_id);
CREATE INDEX IF NOT EXISTS idx_attempts_player_id ON attempts(player_id);
CREATE INDEX IF NOT EXISTS idx_node_logs_attempt_id ON node_logs(attempt_id);
