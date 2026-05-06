// Clinical Pathway Drill Game - REST API Server

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { gameEngine, preloadPathway } from '../core/game-engine';
import { parsePathwayFromFile, validatePath, buildDecisionTree, getNodeById } from '../core/parser';
import { generateReplay } from '../core/scoring';
import { getDb } from '../db/init';
import { wsManager } from './websocket';
import { getAllTimeRanking, getMonthlyRanking, getWinRateRanking } from '../core/leaderboard';

const app = express();
app.use(express.json());

// Port from environment or CLI argument
const PORT = parseInt(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || process.env.PORT || '3000');

// =====================
// Helper Functions
// =====================

/**
 * Get data directory path
 */
function getDataDir(): string {
  return path.join(process.cwd(), 'data');
}

/**
 * Load all pathways from index
 */
function loadAllPathways(): Array<{ id: string; name: string; difficulty: string; description: string }> {
  const dataDir = getDataDir();
  const indexPath = path.join(dataDir, 'pathways', 'index.json');

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const index = JSON.parse(indexContent);
  const pathways: Array<{ id: string; name: string; difficulty: string; description: string }> = [];

  for (const item of index.pathways || []) {
    const pathId = typeof item === 'string' ? item : item.id;
    const filePath = path.join(dataDir, 'pathways', `${pathId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const pathway = parsePathwayFromFile(filePath);
        pathways.push({
          id: pathway.id,
          name: pathway.name,
          difficulty: pathway.difficulty,
          description: pathway.description,
        });
      } catch (e) {
        // Skip invalid pathway files
      }
    }
  }

  return pathways;
}

/**
 * Ensure database is initialized
 */
function ensureDbInitialized(): void {
  const dbPath = path.join(getDataDir(), 'clinic_paths.db');
  if (!fs.existsSync(dbPath)) {
    const db = getDb();
    const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
    }
  }
}

/**
 * Load attempt from database
 */
function loadAttemptFromDb(attemptId: string): any {
  const db = getDb();
  let row: any = null;
  let done = false;

  db.get('SELECT * FROM attempts WHERE attempt_id = ?', [attemptId], (err, r) => {
    row = r;
    done = true;
  });

  while (!done) { /* spin */ }

  if (!row) return null;

  return {
    attemptId: row.attempt_id,
    pathId: row.path_id,
    playerId: row.player_id,
    startTime: row.start_time,
    endTime: row.end_time,
    currentNodeId: row.current_node_id,
    score: row.score,
    completed: !!row.completed,
    remainingTime: row.remaining_time || 0,
    difficulty: row.difficulty,
  };
}

/**
 * Load node logs for an attempt
 */
function loadNodeLogs(attemptId: string): any[] {
  const db = getDb();
  let rows: any[] = [];
  let done = false;

  db.all('SELECT * FROM node_logs WHERE attempt_id = ?', [attemptId], (err, r) => {
    rows = r || [];
    done = true;
  });

  while (!done) { /* spin */ }

  return rows.map(row => ({
    logId: row.log_id,
    attemptId: row.attempt_id,
    nodeId: row.node_id,
    choiceId: row.choice_id,
    timeSpent: row.time_spent,
  }));
}

/**
 * Save pathway to database if not exists
 */
function savePathwayToDb(pathId: string, pathway: any): void {
  const db = getDb();
  let exists = false;
  let done = false;

  db.get('SELECT path_id FROM paths WHERE path_id = ?', [pathId], (err, row: any) => {
    exists = !!row;
    done = true;
  });

  while (!done) { /* spin */ }

  if (!exists) {
    db.run(
      `INSERT INTO paths (path_id, name, description, difficulty, start_node_id, data_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pathId, pathway.name, pathway.description, pathway.difficulty, pathway.startNodeId, JSON.stringify(pathway)],
      (err) => {
        if (err) console.error('Failed to save pathway:', err.message);
      }
    );
  }
}

// =====================
// API Routes
// =====================

/**
 * GET /paths - 返回所有路径清单
 */
app.get('/paths', (req: Request, res: Response) => {
  try {
    ensureDbInitialized();
    const pathways = loadAllPathways();
    res.json({
      success: true,
      data: pathways,
      count: pathways.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load pathways',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /games - 创建新对局
 * Body: { pathId: string, playerId?: string }
 */
app.post('/games', (req: Request, res: Response) => {
  try {
    ensureDbInitialized();
    const { pathId, playerId = 'player1' } = req.body;

    if (!pathId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: pathId',
      });
      return;
    }

    // Load and validate pathway
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, 'pathways', `${pathId}.json`);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        error: 'Pathway not found',
        pathId,
      });
      return;
    }

    const pathway = parsePathwayFromFile(filePath);
    if (!validatePath(pathway)) {
      res.status(400).json({
        success: false,
        error: 'Invalid pathway structure',
        pathId,
      });
      return;
    }

    // Pre-load pathway into engine cache
    preloadPathway(pathId, filePath);

    // Save pathway to DB if not exists
    savePathwayToDb(pathId, pathway);

    // Start game
    const attempt = gameEngine.startGame(pathId, playerId);

    // Return game state
    const tree = (global as any).treeCache?.get(pathId);
    const currentNode = tree ? getNodeById(tree, attempt.currentNodeId) : null;

    res.status(201).json({
      success: true,
      data: {
        attemptId: attempt.attemptId,
        pathId: attempt.pathId,
        playerId: attempt.playerId,
        startTime: attempt.startTime,
        currentNodeId: attempt.currentNodeId,
        currentNode: currentNode ? {
          id: currentNode.id,
          description: currentNode.description,
          nodeType: currentNode.nodeType,
          choices: currentNode.choices.map((c: any) => ({
            id: c.id,
            text: c.text,
          })),
        } : null,
        remainingTime: attempt.remainingTime,
        difficulty: attempt.difficulty,
        score: attempt.score,
        completed: attempt.completed,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create game',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /games/:id - 获取对局当前状态
 */
app.get('/games/:id', (req: Request<{ id: string }>, res: Response) => {
  try {
    ensureDbInitialized();
    const id = req.params.id as string;

    // First check in-memory
    let attempt = gameEngine.getAttempt(id);

    // If not in memory, load from DB
    if (!attempt) {
      attempt = loadAttemptFromDb(id);
      if (!attempt) {
        res.status(404).json({
          success: false,
          error: 'Game not found',
          attemptId: id,
        });
        return;
      }
      attempt.nodeLogs = loadNodeLogs(id);
    }

    // Get current node
    const tree = (global as any).treeCache?.get(attempt.pathId);
    const currentNode = tree ? getNodeById(tree, attempt.currentNodeId) : null;

    res.json({
      success: true,
      data: {
        attemptId: attempt.attemptId,
        pathId: attempt.pathId,
        playerId: attempt.playerId,
        startTime: attempt.startTime,
        endTime: attempt.endTime,
        currentNodeId: attempt.currentNodeId,
        currentNode: currentNode ? {
          id: currentNode.id,
          description: currentNode.description,
          nodeType: currentNode.nodeType,
          choices: currentNode.choices.map((c: any) => ({
            id: c.id,
            text: c.text,
          })),
        } : null,
        remainingTime: attempt.remainingTime,
        difficulty: attempt.difficulty,
        score: attempt.score,
        completed: attempt.completed,
        nodeLogs: attempt.nodeLogs.map((log: any) => ({
          nodeId: log.nodeId,
          choiceId: log.choiceId,
          timeSpent: log.timeSpent,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get game state',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /games/:id/choice - 提交选择
 * Body: { choiceId: string, timeSpent?: number }
 */
app.post('/games/:id/choice', (req: Request<{ id: string }>, res: Response) => {
  try {
    ensureDbInitialized();
    const id = req.params.id as string;
    const { choiceId, timeSpent = 10 } = req.body;

    if (!choiceId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: choiceId',
      });
      return;
    }

    // Load attempt from DB
    const db = getDb();
    let attemptRow: any = null;
    let done = false;

    db.get('SELECT * FROM attempts WHERE attempt_id = ?', [id], (err, row) => {
      attemptRow = row;
      done = true;
    });

    while (!done) { /* spin */ }

    if (!attemptRow) {
      res.status(404).json({
        success: false,
        error: 'Game not found',
        attemptId: id,
      });
      return;
    }

    const attempt: any = {
      attemptId: attemptRow.attempt_id,
      pathId: attemptRow.path_id,
      playerId: attemptRow.player_id,
      startTime: attemptRow.start_time,
      endTime: attemptRow.end_time,
      currentNodeId: attemptRow.current_node_id,
      score: attemptRow.score,
      completed: !!attemptRow.completed,
      remainingTime: attemptRow.remaining_time || 0,
      difficulty: attemptRow.difficulty,
      nodeLogs: [],
    };

    if (attempt.completed) {
      res.status(400).json({
        success: false,
        error: 'Game already completed',
        attemptId: id,
      });
      return;
    }

    // Load pathway
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, 'pathways', `${attempt.pathId}.json`);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        error: 'Pathway file not found',
        pathId: attempt.pathId,
      });
      return;
    }

    preloadPathway(attempt.pathId, filePath);
    const pathway = (global as any).pathwayCache?.get(attempt.pathId);

    if (!pathway) {
      res.status(500).json({
        success: false,
        error: 'Failed to load pathway',
      });
      return;
    }

    const tree = (global as any).treeCache?.get(attempt.pathId);
    if (!tree) {
      res.status(500).json({
        success: false,
        error: 'Failed to build decision tree',
      });
      return;
    }

    const currentNode = tree.nodeMap.get(attempt.currentNodeId);
    if (!currentNode) {
      res.status(500).json({
        success: false,
        error: 'Current node not found',
      });
      return;
    }

    const selectedChoice = currentNode.choices.find((c: any) => c.id === choiceId);
    if (!selectedChoice) {
      res.status(400).json({
        success: false,
        error: 'Choice not found',
        choiceId,
        availableChoices: currentNode.choices.map((c: any) => c.id),
      });
      return;
    }

    // Log the choice
    const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.run(
      'INSERT INTO node_logs (log_id, attempt_id, node_id, choice_id, time_spent) VALUES (?, ?, ?, ?, ?)',
      [logId, id, attempt.currentNodeId, choiceId, timeSpent],
      (err) => { if (err) console.error('Failed to save log:', err.message); }
    );

    // Move to next node
    const newNodeId = selectedChoice.nextNodeId;

    // Apply time bonus
    let newRemainingTime = attempt.remainingTime;
    if (selectedChoice.timeBonus) {
      const timeLimit = attempt.difficulty === 'easy' ? 300 : attempt.difficulty === 'medium' ? 180 : 120;
      newRemainingTime = Math.min(newRemainingTime + selectedChoice.timeBonus, timeLimit);
    }

    // Calculate score
    let scoreEarned = 0;
    let correct = selectedChoice.isCorrect;
    if (correct) {
      const baseScore = 10;
      const multiplier = attempt.difficulty === 'easy' ? 1.0 : attempt.difficulty === 'medium' ? 1.5 : 2.0;
      scoreEarned = Math.round(baseScore * multiplier);
      if (newRemainingTime > 0) {
        scoreEarned += Math.round(newRemainingTime / 10);
      }
    }

    // Check if completed
    const newNode = tree.nodeMap.get(newNodeId);
    const isOutcome = newNode?.nodeType === 'outcome' || (!newNode?.choices?.length && newNode?.nodeType === 'action');
    const completed = isOutcome || !newNode;

    // Update attempt in DB
    db.run(
      'UPDATE attempts SET current_node_id = ?, remaining_time = ?, score = score + ?, completed = ?, end_time = ? WHERE attempt_id = ?',
      [newNodeId, newRemainingTime, scoreEarned, completed ? 1 : 0, completed ? Date.now() : null, id],
      (err) => { if (err) console.error('Failed to update attempt:', err.message); }
    );

    const nextNode = completed ? null : tree.nodeMap.get(newNodeId);

    res.json({
      success: true,
      data: {
        correct,
        feedback: selectedChoice.feedback || (correct ? '选择正确!' : '选择错误'),
        scoreEarned: correct ? scoreEarned : 0,
        newNodeId,
        nextNode: nextNode ? {
          id: nextNode.id,
          description: nextNode.description,
          nodeType: nextNode.nodeType,
          choices: nextNode.choices.map((c: any) => ({
            id: c.id,
            text: c.text,
          })),
        } : null,
        remainingTime: newRemainingTime,
        totalScore: attempt.score + scoreEarned,
        completed,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to submit choice',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /games/:id/replay - 获取复盘报告
 */
app.get('/games/:id/replay', async (req: Request<{ id: string }>, res: Response) => {
  try {
    ensureDbInitialized();
    const id = req.params.id as string;

    // Load attempt from DB
    const attempt = loadAttemptFromDb(id);
    if (!attempt) {
      res.status(404).json({
        success: false,
        error: 'Game not found',
        attemptId: id,
      });
      return;
    }

    attempt.nodeLogs = loadNodeLogs(id);

    // Generate replay
    const report = await generateReplay(attempt);

    res.json({
      success: true,
      data: {
        attemptId: report.attemptId,
        pathId: report.pathId,
        pathName: report.pathName,
        playerId: report.playerId,
        startTime: report.startTime,
        endTime: report.endTime,
        totalScore: report.totalScore,
        completed: report.completed,
        nodeResults: report.nodeResults,
        markdown: report.markdown,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate replay',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /leaderboard - Get all-time ranking
 */
app.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    ensureDbInitialized();
    const rankings = await getAllTimeRanking();
    res.json({
      success: true,
      data: rankings,
      count: rankings.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /leaderboard/monthly - Get monthly ranking
 * Query params: year (required), month (required)
 */
app.get('/leaderboard/monthly', async (req: Request, res: Response) => {
  try {
    ensureDbInitialized();
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);

    if (isNaN(year) || isNaN(month) || year < 2000 || year > 2100 || month < 1 || month > 12) {
      res.status(400).json({
        success: false,
        error: 'Invalid year or month parameter',
      });
      return;
    }

    const rankings = await getMonthlyRanking(year, month);
    res.json({
      success: true,
      data: rankings,
      count: rankings.length,
      year,
      month,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get monthly leaderboard',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /leaderboard/winrate - Get win rate ranking
 */
app.get('/leaderboard/winrate', async (req: Request, res: Response) => {
  try {
    ensureDbInitialized();
    const rankings = await getWinRateRanking();
    res.json({
      success: true,
      data: rankings,
      count: rankings.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get win rate leaderboard',
      message: (error as Error).message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: Date.now(),
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path,
  });
});

/**
 * Error handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// =====================
// Start Server
// =====================

const server = createServer(app);

// Enable WebSocket upgrade for real-time timer
server.on('upgrade', (request, socket, head) => {
  const urlStr = request.url || '/';
  const url = new URL(urlStr, `http://${request.headers.host || 'localhost'}`);

  // Only handle /ws path
  if (url.pathname === '/ws' || url.pathname === '/websocket') {
    wsManager.handleUpgrade(request, socket, head);
  } else {
    socket.destroy();
  }
});

app.listen(PORT, () => {
  console.log(`Clinical Pathway Drill Game API Server`);
  console.log(`====================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(``);
  console.log(`Endpoints:`);
  console.log(`  GET  /paths              - List all pathways`);
  console.log(`  POST /games              - Create new game`);
  console.log(`  GET  /games/:id          - Get game state`);
  console.log(`  POST /games/:id/choice   - Submit choice`);
  console.log(`  GET  /games/:id/replay   - Get replay report`);
  console.log(`  GET  /health             - Health check`);
  console.log(``);
  console.log(`Start with: node dist/src/api/server.js --port=3000`);
});

export { app };
