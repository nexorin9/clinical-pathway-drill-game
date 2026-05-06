// Leaderboard Engine for Clinical Pathway Drill Game
// Provides ranking functionality: all-time, monthly, and win-rate rankings

import { getDb } from '../db/init';
import { PlayerScore } from './types';

/**
 * Get all-time ranking sorted by total score
 */
export function getAllTimeRanking(): Promise<PlayerScore[]> {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `
      SELECT
        p.player_id as playerId,
        COALESCE(SUM(a.score), 0) as totalScore,
        COUNT(a.attempt_id) as gameCount,
        SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) as winCount,
        CAST(SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(a.attempt_id) as winRate,
        CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avgScorePerGame
      FROM players p
      LEFT JOIN attempts a ON p.player_id = a.player_id
      GROUP BY p.player_id
      HAVING gameCount > 0
      ORDER BY totalScore DESC
      LIMIT 50
    `;

    db.all(sql, (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      const rankings: PlayerScore[] = rows.map(row => ({
        playerId: row.playerId,
        totalScore: row.totalScore || 0,
        gameCount: row.gameCount || 0,
        winCount: row.winCount || 0,
        winRate: row.winRate || 0,
        avgScorePerGame: row.avgScorePerGame || 0,
      }));

      resolve(rankings);
    });
  });
}

/**
 * Get monthly ranking for a specific year and month
 */
export function getMonthlyRanking(year: number, month: number): Promise<PlayerScore[]> {
  return new Promise((resolve, reject) => {
    const db = getDb();

    // Calculate start and end timestamps for the month
    const startTime = new Date(year, month - 1, 1).getTime();
    const endTime = new Date(year, month, 1).getTime();

    const sql = `
      SELECT
        p.player_id as playerId,
        COALESCE(SUM(a.score), 0) as totalScore,
        COUNT(a.attempt_id) as gameCount,
        SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) as winCount,
        CAST(SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(a.attempt_id) as winRate,
        CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avgScorePerGame
      FROM players p
      LEFT JOIN attempts a ON p.player_id = a.player_id
        AND a.start_time >= ? AND a.start_time < ?
      GROUP BY p.player_id
      HAVING gameCount > 0
      ORDER BY totalScore DESC
      LIMIT 50
    `;

    db.all(sql, [startTime, endTime], (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      const rankings: PlayerScore[] = rows.map(row => ({
        playerId: row.playerId,
        totalScore: row.totalScore || 0,
        gameCount: row.gameCount || 0,
        winCount: row.winCount || 0,
        winRate: row.winRate || 0,
        avgScorePerGame: row.avgScorePerGame || 0,
      }));

      resolve(rankings);
    });
  });
}

/**
 * Get win-rate ranking (minimum 3 games to be listed)
 */
export function getWinRateRanking(): Promise<PlayerScore[]> {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `
      SELECT
        p.player_id as playerId,
        COALESCE(SUM(a.score), 0) as totalScore,
        COUNT(a.attempt_id) as gameCount,
        SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) as winCount,
        CAST(SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(a.attempt_id) * 100 as winRate,
        CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avgScorePerGame
      FROM players p
      LEFT JOIN attempts a ON p.player_id = a.player_id
      GROUP BY p.player_id
      HAVING gameCount >= 3
      ORDER BY winRate DESC
      LIMIT 50
    `;

    db.all(sql, (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      const rankings: PlayerScore[] = rows.map(row => ({
        playerId: row.playerId,
        totalScore: row.totalScore || 0,
        gameCount: row.gameCount || 0,
        winCount: row.winCount || 0,
        winRate: row.winRate || 0,
        avgScorePerGame: row.avgScorePerGame || 0,
      }));

      resolve(rankings);
    });
  });
}

/**
 * Get player stats by playerId
 */
export function getPlayerStats(playerId: string): Promise<PlayerScore | null> {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `
      SELECT
        p.player_id as playerId,
        COALESCE(SUM(a.score), 0) as totalScore,
        COUNT(a.attempt_id) as gameCount,
        SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) as winCount,
        CAST(SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(a.attempt_id) * 100 as winRate,
        CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avgScorePerGame
      FROM players p
      LEFT JOIN attempts a ON p.player_id = a.player_id
      WHERE p.player_id = ?
      GROUP BY p.player_id
    `;

    db.get(sql, [playerId], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }

      if (!row) {
        resolve(null);
        return;
      }

      resolve({
        playerId: row.playerId,
        totalScore: row.totalScore || 0,
        gameCount: row.gameCount || 0,
        winCount: row.winCount || 0,
        winRate: row.winRate || 0,
        avgScorePerGame: row.avgScorePerGame || 0,
      });
    });
  });
}

/**
 * Format ranking for CLI display
 */
export function formatRankingCLI(rankings: PlayerScore[], title: string): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════');
  lines.push(`  ${title}`);
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  if (rankings.length === 0) {
    lines.push('暂无排行数据');
    return lines.join('\n');
  }

  const medal = ['🥇', '🥈', '🥉'];
  for (let i = 0; i < rankings.length; i++) {
    const p = rankings[i];
    const rank = i < 3 ? medal[i] : `${i + 1}.`;
    lines.push(`${rank} ${p.playerId}`);
    lines.push(`   总分: ${p.totalScore} | 场次: ${p.gameCount} | 胜率: ${p.winRate.toFixed(1)}% | 均分: ${p.avgScorePerGame.toFixed(1)}`);
    lines.push('');
  }

  return lines.join('\n');
}
