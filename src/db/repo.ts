// Data Access Layer for Clinical Pathway Drill Game

import { Attempt, NodeLog } from '../core/types';
import { getDb } from './init';

export interface AttemptRow {
  attempt_id: string;
  path_id: string;
  player_id: string;
  start_time: number;
  end_time?: number;
  current_node_id: string;
  score: number;
  completed: number;
  remaining_time: number;
  difficulty: string;
}

export interface HistoryRow {
  attempt_id: string;
  path_id: string;
  player_id: string;
  start_time: number;
  end_time?: number;
  score: number;
  completed: number;
  difficulty: string;
  path_name?: string;
}

/**
 * Save an attempt to the database
 */
export function saveAttempt(attempt: Attempt): void {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO attempts (attempt_id, path_id, player_id, start_time, end_time, current_node_id, score, completed, remaining_time, difficulty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attempt.attemptId,
      attempt.pathId,
      attempt.playerId,
      attempt.startTime,
      attempt.endTime || null,
      attempt.currentNodeId,
      attempt.score,
      attempt.completed ? 1 : 0,
      attempt.remainingTime,
      attempt.difficulty,
    ],
    (err) => {
      if (err) {
        console.error('Failed to save attempt:', err.message);
      }
    }
  );
}

/**
 * Load an attempt from the database by ID
 */
export function loadAttempt(attemptId: string): Attempt | null {
  const db = getDb();
  let row: any = null;
  let done = false;

  db.get('SELECT * FROM attempts WHERE attempt_id = ?', [attemptId], (err, r) => {
    if (!err && r) {
      row = r;
    }
    done = true;
  });

  // Spin wait for sync access (sqlite3 callback API)
  while (!done) { /* spin */ }

  if (!row) return null;

  // Load node logs
  const nodeLogs = loadNodeLogs(attemptId);

  const attempt: Attempt = {
    attemptId: row.attempt_id,
    pathId: row.path_id,
    playerId: row.player_id,
    startTime: row.start_time,
    endTime: row.end_time,
    currentNodeId: row.current_node_id,
    score: row.score,
    completed: !!row.completed,
    nodeLogs,
    remainingTime: row.remaining_time,
    difficulty: row.difficulty as 'easy' | 'medium' | 'hard',
  };

  return attempt;
}

/**
 * Load node logs for an attempt
 */
function loadNodeLogs(attemptId: string): NodeLog[] {
  const db = getDb();
  let rows: any = [];
  let done = false;

  db.all('SELECT * FROM node_logs WHERE attempt_id = ? ORDER BY created_at', [attemptId], (err, r) => {
    if (!err && r) {
      rows = r;
    }
    done = true;
  });

  while (!done) { /* spin */ }

  return (rows as any[]).map((row) => ({
    logId: row.log_id,
    attemptId: row.attempt_id,
    nodeId: row.node_id,
    choiceId: row.choice_id,
    timeSpent: row.time_spent,
  }));
}

/**
 * Save a node log entry
 */
export function saveNodeLog(log: NodeLog): void {
  const db = getDb();
  db.run(
    'INSERT INTO node_logs (log_id, attempt_id, node_id, choice_id, time_spent) VALUES (?, ?, ?, ?, ?)',
    [log.logId, log.attemptId, log.nodeId, log.choiceId, log.timeSpent],
    (err) => {
      if (err) {
        console.error('Failed to save node log:', err.message);
      }
    }
  );
}

/**
 * Export game history in CSV or JSON format
 */
export function exportHistory(format: 'csv' | 'json', limit: number = 100): string {
  const db = getDb();
  let rows: any = [];
  let done = false;

  const sql = `SELECT a.attempt_id, a.path_id, a.player_id, a.start_time, a.end_time,
                      a.score, a.completed, a.difficulty,
                      p.name as path_name
               FROM attempts a
               LEFT JOIN paths p ON a.path_id = p.path_id
               ORDER BY a.start_time DESC
               LIMIT ?`;

  db.all(sql, [limit], (err, r) => {
    if (!err && r) {
      rows = r;
    }
    done = true;
  });

  while (!done) { /* spin */ }

  const typedRows = rows as HistoryRow[];

  if (format === 'csv') {
    const header = 'attempt_id,path_id,player_id,start_time,end_time,score,completed,difficulty,path_name';
    const lines = [header];
    for (const row of typedRows) {
      lines.push([
        row.attempt_id,
        row.path_id,
        row.player_id,
        new Date(row.start_time).toISOString(),
        row.end_time ? new Date(row.end_time).toISOString() : '',
        row.score,
        row.completed ? 1 : 0,
        row.difficulty,
        `"${(row.path_name || '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    return lines.join('\n');
  } else {
    return JSON.stringify(typedRows, null, 2);
  }
}

/**
 * Get all attempts for a player
 */
export function getAttemptsByPlayer(playerId: string): Attempt[] {
  const db = getDb();
  let rows: any = [];
  let done = false;

  db.all('SELECT * FROM attempts WHERE player_id = ? ORDER BY start_time DESC', [playerId], (err, r) => {
    if (!err && r) {
      rows = r;
    }
    done = true;
  });

  while (!done) { /* spin */ }

  const typedRows = rows as AttemptRow[];
  return typedRows.map((row) => ({
    attemptId: row.attempt_id,
    pathId: row.path_id,
    playerId: row.player_id,
    startTime: row.start_time,
    endTime: row.end_time,
    currentNodeId: row.current_node_id,
    score: row.score,
    completed: !!row.completed,
    nodeLogs: loadNodeLogs(row.attempt_id),
    remainingTime: row.remaining_time,
    difficulty: row.difficulty as 'easy' | 'medium' | 'hard',
  }));
}

/**
 * Update attempt score and completion status
 */
export function updateAttempt(attemptId: string, updates: {
  currentNodeId?: string;
  score?: number;
  remainingTime?: number;
  completed?: boolean;
  endTime?: number;
}): void {
  const db = getDb();
  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.currentNodeId !== undefined) {
    setClauses.push('current_node_id = ?');
    values.push(updates.currentNodeId);
  }
  if (updates.score !== undefined) {
    setClauses.push('score = ?');
    values.push(updates.score);
  }
  if (updates.remainingTime !== undefined) {
    setClauses.push('remaining_time = ?');
    values.push(updates.remainingTime);
  }
  if (updates.completed !== undefined) {
    setClauses.push('completed = ?');
    values.push(updates.completed ? 1 : 0);
  }
  if (updates.endTime !== undefined) {
    setClauses.push('end_time = ?');
    values.push(updates.endTime);
  }

  if (setClauses.length === 0) return;

  values.push(attemptId);
  const sql = `UPDATE attempts SET ${setClauses.join(', ')} WHERE attempt_id = ?`;

  db.run(sql, values, (err) => {
    if (err) {
      console.error('Failed to update attempt:', err.message);
    }
  });
}