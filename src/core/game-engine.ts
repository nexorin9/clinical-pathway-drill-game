// Clinical Pathway Game Engine - Core State Machine

import { Attempt, Node, NodeLog, ScoreResult, Pathway, Tree } from './types';
import { buildDecisionTree, getNodeById } from './parser';
import * as sqlite3 from 'sqlite3';
import { getDb } from '../db/init';
import * as path from 'path';
import * as fs from 'fs';

export class GameEngineError extends Error {
  constructor(message: string, public readonly attemptId?: string) {
    super(message);
    this.name = 'GameEngineError';
  }
}

// In-memory attempt store (for active games)
const activeAttempts = new Map<string, Attempt>();
// Pathway cache
const pathwayCache = new Map<string, Pathway>();
// Tree cache
const treeCache = new Map<string, Tree>();

/**
 * Generate a unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load pathway from database or cache
 */
function loadPathway(pathId: string): Pathway | null {
  // Check cache first (synchronous)
  if (pathwayCache.has(pathId)) {
    return pathwayCache.get(pathId)!;
  }

  // Load synchronously from DB - sqlite3 callback API is actually async
  // so we need to use a different approach - load from JSON file directly
  // This is faster and avoids the async callback issue
  const db = getDb();
  let pathway: Pathway | null = null;

  db.get('SELECT data_json FROM paths WHERE path_id = ?', [pathId], (err, row: any) => {
    if (err || !row) return;
    try {
      const data = JSON.parse(row.data_json);
      pathway = {
        id: data.id,
        name: data.name,
        description: data.description,
        difficulty: data.difficulty,
        admissionNode: data.admissionNode,
        decisionNodes: data.decisionNodes,
        startNodeId: data.startNodeId,
      };
      pathwayCache.set(pathId, pathway);
    } catch {
      // Failed to parse
    }
  });

  return pathway;
}

/**
 * Pre-load pathway into cache from file (for synchronous startGame)
 */
export function preloadPathway(pathId: string, filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    const pathway: Pathway = {
      id: json.id,
      name: json.name,
      description: json.description || '',
      difficulty: json.difficulty,
      admissionNode: json.admissionNode,
      decisionNodes: json.decisionNodes || [],
      startNodeId: json.startNodeId || json.admissionNode?.id,
    };
    pathwayCache.set(pathId, pathway);

    // Also build and cache the decision tree
    const tree = buildDecisionTree(pathway);
    treeCache.set(pathId, tree);
  } catch (e) {
    // Failed to preload
  }
}

/**
 * Load attempt from database and ensure pathway is cached
 * Returns the loaded attempt (not stored in activeAttempts - kept in engine's getAttempt in-memory cache)
 */
export function loadAttemptFromDb(attemptId: string): Attempt | null {
  const db = getDb();
  let row: any = null;
  let done = false;

  db.get('SELECT * FROM attempts WHERE attempt_id = ?', [attemptId], (err, r) => {
    row = r;
    done = true;
  });

  while (!done) { /* spin */ }

  if (!row) return null;

  const loadedAttempt: Attempt = {
    attemptId: row.attempt_id,
    pathId: row.path_id,
    playerId: row.player_id,
    startTime: row.start_time,
    endTime: row.end_time,
    currentNodeId: row.current_node_id,
    score: row.score,
    completed: !!row.completed,
    nodeLogs: [],
    remainingTime: row.remaining_time || 0,
    difficulty: row.difficulty as 'easy' | 'medium' | 'hard',
  };

  // Load node logs
  let logsDone = false;
  db.all('SELECT * FROM node_logs WHERE attempt_id = ?', [attemptId], (logErr, logRows: any[]) => {
    if (!logErr && logRows) {
      for (const logRow of logRows) {
        loadedAttempt.nodeLogs.push({
          logId: logRow.log_id,
          attemptId: logRow.attempt_id,
          nodeId: logRow.node_id,
          choiceId: logRow.choice_id,
          timeSpent: logRow.time_spent,
        });
      }
    }
    logsDone = true;
  });

  while (!logsDone) { /* spin */ }

  // Cache it
  activeAttempts.set(attemptId, loadedAttempt);

  return loadedAttempt;
}

/**
 * Get current node from tree given attempt
 */
export function getCurrentNodeFromTree(attempt: Attempt): Node | null {
  const pathway = pathwayCache.get(attempt.pathId);
  if (!pathway) return null;

  const tree = treeCache.get(attempt.pathId);
  if (!tree) return null;

  return getNodeById(tree, attempt.currentNodeId) || null;
}

/**
 * Get difficulty time limit (in seconds)
 */
function getTimeLimit(difficulty: 'easy' | 'medium' | 'hard'): number {
  switch (difficulty) {
    case 'easy': return 300;   // 5 minutes
    case 'medium': return 180; // 3 minutes
    case 'hard': return 120;   // 2 minutes
    default: return 180;
  }
}

/**
 * Get difficulty score multiplier
 */
function getDifficultyMultiplier(difficulty: 'easy' | 'medium' | 'hard'): number {
  switch (difficulty) {
    case 'easy': return 1.0;
    case 'medium': return 1.5;
    case 'hard': return 2.0;
    default: return 1.0;
  }
}

export class GameEngine {
  /**
   * Start a new game session
   * @param pathId Clinical pathway ID
   * @param playerId Player identifier
   * @returns Created Attempt object
   */
  startGame(pathId: string, playerId: string): Attempt {
    // Try to load pathway
    const pathway = loadPathway(pathId);
    if (!pathway) {
      throw new GameEngineError(`Pathway not found: ${pathId}`);
    }

    const attemptId = generateId('attempt');
    const timeLimit = getTimeLimit(pathway.difficulty);

    const attempt: Attempt = {
      attemptId,
      pathId,
      playerId,
      startTime: Date.now(),
      currentNodeId: pathway.startNodeId,
      score: 0,
      completed: false,
      nodeLogs: [],
      remainingTime: timeLimit,
      difficulty: pathway.difficulty,
    };

    // Store in memory
    activeAttempts.set(attemptId, attempt);

    // Persist to database
    const db = getDb();
    db.run(
      `INSERT INTO attempts (attempt_id, path_id, player_id, start_time, current_node_id, score, completed, remaining_time, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [attemptId, pathId, playerId, attempt.startTime, attempt.currentNodeId, 0, 0, timeLimit, pathway.difficulty],
      (err) => {
        if (err) {
          console.error('Failed to save attempt:', err);
        }
      }
    );

    return attempt;
  }

  /**
   * Get the current node for an attempt (synchronous, only for active games)
   * @param attemptId Attempt ID
   * @returns Current Node or null if not found/active
   */
  getCurrentNode(attemptId: string): Node | null {
    const attempt = activeAttempts.get(attemptId);
    if (!attempt) {
      return null; // Only works for active in-memory attempts
    }
    return this.getCurrentNodeFromPathway(attempt);
  }

  private getCurrentNodeFromPathway(attempt: Attempt): Node | null {
    const pathway = pathwayCache.get(attempt.pathId);
    if (!pathway) {
      // Try to load
      const loaded = loadPathway(attempt.pathId);
      if (!loaded) return null;
    }
    const tree = treeCache.get(attempt.pathId) || buildDecisionTree(pathwayCache.get(attempt.pathId)!);
    treeCache.set(attempt.pathId, tree);
    return getNodeById(tree, attempt.currentNodeId) || null;
  }

  /**
   * Load an attempt from database
   */
  private loadAttemptFromDb(attemptId: string): Attempt {
    return new Promise<Attempt>((resolve) => {
      const db = getDb();
      db.get('SELECT * FROM attempts WHERE attempt_id = ?', [attemptId], (err, row: any) => {
        if (err || !row) {
          throw new GameEngineError(`Attempt not found: ${attemptId}`, attemptId);
        }
        const attempt: Attempt = {
          attemptId: row.attempt_id,
          pathId: row.path_id,
          playerId: row.player_id,
          startTime: row.start_time,
          endTime: row.end_time,
          currentNodeId: row.current_node_id,
          score: row.score,
          completed: !!row.completed,
          nodeLogs: [],
          remainingTime: row.remaining_time || 0,
          difficulty: row.difficulty as 'easy' | 'medium' | 'hard',
        };
        activeAttempts.set(attemptId, attempt);
        resolve(attempt);
      });
    }) as any;
  }

  /**
   * Make a choice at the current node
   * @param attemptId Attempt ID
   * @param choiceId Selected choice ID
   * @param timeSpent Time spent on this decision (seconds)
   */
  makeChoice(attemptId: string, choiceId: string, timeSpent: number = 0): void {
    const attempt = activeAttempts.get(attemptId);
    if (!attempt) {
      this.loadAttemptFromDb(attemptId);
    }
    const currentAttempt = activeAttempts.get(attemptId);
    if (!currentAttempt) {
      throw new GameEngineError(`Attempt not found: ${attemptId}`, attemptId);
    }

    if (currentAttempt.completed) {
      throw new GameEngineError('Attempt already completed', attemptId);
    }

    const pathway = pathwayCache.get(currentAttempt.pathId);
    if (!pathway) {
      throw new GameEngineError(`Pathway not found: ${currentAttempt.pathId}`);
    }

    const tree = treeCache.get(currentAttempt.pathId) || buildDecisionTree(pathway);
    treeCache.set(currentAttempt.pathId, tree);

    const currentNode = getNodeById(tree, currentAttempt.currentNodeId);
    if (!currentNode) {
      throw new GameEngineError(`Current node not found: ${currentAttempt.currentNodeId}`, attemptId);
    }

    // Find the selected choice
    const selectedChoice = currentNode.choices.find(c => c.id === choiceId);
    if (!selectedChoice) {
      throw new GameEngineError(`Choice not found: ${choiceId}`, attemptId);
    }

    // Log the choice
    const log: NodeLog = {
      logId: generateId('log'),
      attemptId,
      nodeId: currentAttempt.currentNodeId,
      choiceId,
      timeSpent,
    };
    currentAttempt.nodeLogs.push(log);

    // Persist node log
    const db = getDb();
    db.run(
      'INSERT INTO node_logs (log_id, attempt_id, node_id, choice_id, time_spent) VALUES (?, ?, ?, ?, ?)',
      [log.logId, attemptId, currentAttempt.currentNodeId, choiceId, timeSpent],
      (err) => {
        if (err) console.error('Failed to save node log:', err);
      }
    );

    // Move to next node
    currentAttempt.currentNodeId = selectedChoice.nextNodeId;

    // Apply time bonus if any
    if (selectedChoice.timeBonus) {
      currentAttempt.remainingTime = Math.min(
        currentAttempt.remainingTime + selectedChoice.timeBonus,
        getTimeLimit(currentAttempt.difficulty)
      );
    }

    // Update database
    db.run(
      'UPDATE attempts SET current_node_id = ?, remaining_time = ? WHERE attempt_id = ?',
      [currentAttempt.currentNodeId, currentAttempt.remainingTime, attemptId],
      (err) => {
        if (err) console.error('Failed to update attempt:', err);
      }
    );
  }

  /**
   * Submit answer and calculate score for current node
   * @param attemptId Attempt ID
   * @returns Result with correctness and time bonus
   */
  submitAnswer(attemptId: string): { correct: boolean; timeBonus: number; scoreEarned: number } {
    const attempt = activeAttempts.get(attemptId);
    if (!attempt) {
      throw new GameEngineError(`Attempt not found: ${attemptId}`, attemptId);
    }

    const pathway = pathwayCache.get(attempt.pathId);
    if (!pathway) {
      throw new GameEngineError(`Pathway not found: ${attempt.pathId}`);
    }

    const tree = treeCache.get(attempt.pathId) || buildDecisionTree(pathway);
    const currentNode = getNodeById(tree, attempt.currentNodeId);
    if (!currentNode) {
      throw new GameEngineError(`Current node not found: ${attempt.currentNodeId}`, attemptId);
    }

    // Get the last choice made
    const lastLog = attempt.nodeLogs[attempt.nodeLogs.length - 1];
    if (!lastLog) {
      throw new GameEngineError('No choice made yet', attemptId);
    }

    const selectedChoice = currentNode.choices.find(c => c.id === lastLog.choiceId);
    if (!selectedChoice) {
      throw new GameEngineError(`Choice not found: ${lastLog.choiceId}`, attemptId);
    }

    const correct = selectedChoice.isCorrect;
    let scoreEarned = 0;
    let timeBonus = 0;

    if (correct) {
      // Base score per correct answer
      const baseScore = 10;
      // Difficulty multiplier
      const multiplier = getDifficultyMultiplier(attempt.difficulty);
      scoreEarned = Math.round(baseScore * multiplier);

      // Time bonus: more time remaining = higher bonus
      if (attempt.remainingTime > 0) {
        timeBonus = Math.round(attempt.remainingTime / 10);
        scoreEarned += timeBonus;
      }

      attempt.score += scoreEarned;
    }

    // Check if this was the last node (outcome node)
    if (currentNode.nodeType === 'outcome' || (!currentNode.choices.length && currentNode.nodeType === 'action')) {
      attempt.completed = true;
      attempt.endTime = Date.now();

      const db = getDb();
      db.run(
        'UPDATE attempts SET score = ?, completed = 1, end_time = ? WHERE attempt_id = ?',
        [attempt.score, attempt.endTime, attemptId],
        (err) => {
          if (err) console.error('Failed to update attempt:', err);
        }
      );
    }

    return { correct, timeBonus, scoreEarned };
  }

  /**
   * Handle timeout event
   * @param attemptId Attempt ID
   */
  timeout(attemptId: string): void {
    const attempt = activeAttempts.get(attemptId);
    if (!attempt) {
      throw new GameEngineError(`Attempt not found: ${attemptId}`, attemptId);
    }

    if (attempt.completed) {
      return; // Already completed, ignore timeout
    }

    attempt.completed = true;
    attempt.remainingTime = 0;
    attempt.endTime = Date.now();

    const db = getDb();
    db.run(
      'UPDATE attempts SET completed = 1, remaining_time = 0, end_time = ? WHERE attempt_id = ?',
      [attempt.endTime, attemptId],
      (err) => {
        if (err) console.error('Failed to update attempt on timeout:', err);
      }
    );
  }

  /**
   * Get attempt by ID (in-memory only)
   * @param attemptId Attempt ID
   */
  getAttempt(attemptId: string): Attempt | null {
    return activeAttempts.get(attemptId) || null;
  }

  /**
   * Check if attempt is active
   */
  isActive(attemptId: string): boolean {
    const attempt = activeAttempts.get(attemptId);
    return !!attempt && !attempt.completed;
  }

  /**
   * Update remaining time for an attempt (called by timer)
   */
  updateRemainingTime(attemptId: string, remainingTime: number): void {
    const attempt = activeAttempts.get(attemptId);
    if (attempt && !attempt.completed) {
      attempt.remainingTime = Math.max(0, remainingTime);
    }
  }
}

// Export singleton instance
export const gameEngine = new GameEngine();
