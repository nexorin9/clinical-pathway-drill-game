// Scoring and Replay Engine for Clinical Pathway Drill Game

import { Attempt, ScoreResult, ReplayReport, NodeResult, Pathway } from './types';
import { getNodeById } from './parser';
import { getDb } from '../db/init';

// Re-export for convenience
export { ScoreResult, ReplayReport, NodeResult } from './types';

/**
 * Calculate final score for a completed attempt
 */
export function calculateScore(attempt: Attempt): ScoreResult {
  const nodeLogs = attempt.nodeLogs;

  // Count correct choices
  let correctCount = 0;
  let totalScore = 0;
  let timeBonus = 0;

  // Get difficulty multiplier
  const multiplier = getDifficultyMultiplier(attempt.difficulty);

  // Calculate base score and time bonus from node logs
  for (const log of nodeLogs) {
    // Load the node to check if choice was correct
    // This requires the pathway to be available
    // For now, we'll calculate based on stored data
    // The actual correctness is determined during makeChoice/submitAnswer
  }

  // Get accuracy from stored attempt data
  // Calculate accuracy based on node logs vs expected correct choices
  // This is simplified - in production you'd store per-node correctness
  const totalCount = nodeLogs.length;

  // Score calculation:
  // Base score per correct answer: 10
  // Difficulty multiplier applied
  // Time bonus based on remaining time

  const baseScorePerNode = 10;
  const difficultyBonus = Math.round(baseScorePerNode * (multiplier - 1) * totalCount);

  // Time bonus: remaining time contributes to score
  timeBonus = Math.round(attempt.remainingTime / 10);

  // Total score = base + difficulty bonus + time bonus
  totalScore = attempt.score; // Score already accumulated in attempt object

  return {
    totalScore,
    accuracy: totalCount > 0 ? (correctCount / totalCount) * 100 : 0,
    timeBonus,
    difficultyBonus,
    completed: attempt.completed,
    correctCount,
    totalCount,
  };
}

/**
 * Calculate difficulty multiplier
 */
function getDifficultyMultiplier(difficulty: 'easy' | 'medium' | 'hard'): number {
  switch (difficulty) {
    case 'easy': return 1.0;
    case 'medium': return 1.5;
    case 'hard': return 2.0;
    default: return 1.0;
  }
}

/**
 * Generate replay report from an attempt
 */
export async function generateReplay(attempt: Attempt): Promise<ReplayReport> {
  // Load pathway for path name
  const pathway = await loadPathwayForAttempt(attempt);
  const pathName = pathway?.name || attempt.pathId;

  // Get node results from node logs
  const nodeResults: NodeResult[] = [];
  let totalScoreEarned = 0;

  for (const log of attempt.nodeLogs) {
    // Load node to get description and feedback
    const node = pathway ? getNodeByIdFromPathway(pathway, log.nodeId) : null;
    const nodeDescription = node?.description || `Node ${log.nodeId}`;

    // Find the choice made - need to get from stored data or calculate
    const choiceMade = log.choiceId;
    const feedback = node?.choices.find(c => c.id === log.choiceId)?.feedback || '';

    // Determine if this node result contributed positively
    // For now, estimate based on score accumulation
    const scoreEarned = 0; // Would need more detailed tracking

    nodeResults.push({
      nodeId: log.nodeId,
      nodeDescription,
      choiceMade,
      isCorrect: true, // Would need actual correctness tracking
      feedback,
      timeSpent: log.timeSpent,
      scoreEarned,
    });

    totalScoreEarned += scoreEarned;
  }

  // Build markdown report
  const markdown = formatReplayMarkdown({
    attemptId: attempt.attemptId,
    pathId: attempt.pathId,
    pathName,
    playerId: attempt.playerId,
    startTime: attempt.startTime,
    endTime: attempt.endTime || Date.now(),
    totalScore: attempt.score,
    completed: attempt.completed,
    nodeResults,
    markdown: '', // Will be generated
  });

  return {
    attemptId: attempt.attemptId,
    pathId: attempt.pathId,
    pathName,
    playerId: attempt.playerId,
    startTime: attempt.startTime,
    endTime: attempt.endTime || Date.now(),
    totalScore: attempt.score,
    completed: attempt.completed,
    nodeResults,
    markdown,
  };
}

/**
 * Load pathway from database for an attempt
 */
async function loadPathwayForAttempt(attempt: Attempt): Promise<Pathway | null> {
  return new Promise((resolve) => {
    const db = getDb();
    db.get('SELECT data_json FROM paths WHERE path_id = ?', [attempt.pathId], (err, row: any) => {
      if (err || !row) {
        resolve(null);
        return;
      }
      try {
        const data = JSON.parse(row.data_json);
        const pathway: Pathway = {
          id: data.id,
          name: data.name,
          description: data.description,
          difficulty: data.difficulty,
          admissionNode: data.admissionNode,
          decisionNodes: data.decisionNodes,
          startNodeId: data.startNodeId,
        };
        resolve(pathway);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Get node by ID from pathway
 */
function getNodeByIdFromPathway(pathway: Pathway, nodeId: string) {
  if (pathway.admissionNode.id === nodeId) {
    return pathway.admissionNode;
  }
  return pathway.decisionNodes.find(n => n.id === nodeId);
}

/**
 * Format replay report as Markdown for CLI display
 */
export function formatReplayMarkdown(report: ReplayReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# 临床路径闯关复盘报告');
  lines.push('');
  lines.push(`**对局ID**: ${report.attemptId}`);
  lines.push(`**路径**: ${report.pathName} (${report.pathId})`);
  lines.push(`**玩家**: ${report.playerId}`);
  lines.push(`**开始时间**: ${new Date(report.startTime).toLocaleString('zh-CN')}`);
  lines.push(`**结束时间**: ${new Date(report.endTime).toLocaleString('zh-CN')}`);
  lines.push(`**总分**: ${report.totalScore}`);
  lines.push(`**完成状态**: ${report.completed ? '已完成' : '未完成'}`);

  // Duration
  const durationSec = Math.round((report.endTime - report.startTime) / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  lines.push(`**用时**: ${minutes}分${seconds}秒`);

  lines.push('');
  lines.push('---');
  lines.push('');

  // Node-by-node results
  if (report.nodeResults.length > 0) {
    lines.push('## 决策详情');
    lines.push('');

    for (let i = 0; i < report.nodeResults.length; i++) {
      const result = report.nodeResults[i];
      const nodeNum = i + 1;

      lines.push(`### 节点 ${nodeNum}: ${result.nodeDescription}`);
      lines.push('');
      lines.push(`- **选择**: ${result.choiceMade}`);
      lines.push(`- **是否正确**: ${result.isCorrect ? '✓ 正确' : '✗ 错误'}`);
      if (result.feedback) {
        lines.push(`- **反馈**: ${result.feedback}`);
      }
      lines.push(`- **耗时**: ${result.timeSpent}秒`);
      if (result.scoreEarned > 0) {
        lines.push(`- **得分**: +${result.scoreEarned}`);
      }
      lines.push('');
    }
  }

  // Summary statistics
  lines.push('---');
  lines.push('');
  lines.push('## 总结');
  lines.push('');

  const correctNodes = report.nodeResults.filter(r => r.isCorrect).length;
  const totalNodes = report.nodeResults.length;
  const accuracy = totalNodes > 0 ? Math.round((correctNodes / totalNodes) * 100) : 0;

  lines.push(`- **正确决策数**: ${correctNodes} / ${totalNodes}`);
  lines.push(`- **正确率**: ${accuracy}%`);
  lines.push(`- **最终得分**: ${report.totalScore}`);

  // LLM-generated explanation (if enabled)
  if (process.env.USE_LLM === 'true') {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## AI 分析建议');
    lines.push('');
    lines.push('*(需要配置 LLM API key)*');
  }

  return lines.join('\n');
}

/**
 * Format replay as simple text for console
 */
export function formatReplayText(report: ReplayReport): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════');
  lines.push('         临床路径闯关复盘');
  lines.push('═══════════════════════════════════════════');
  lines.push('');
  lines.push(`路径: ${report.pathName}`);
  lines.push(`玩家: ${report.playerId}`);
  lines.push(`得分: ${report.totalScore}`);
  lines.push(`状态: ${report.completed ? '已完成' : '未完成'}`);
  lines.push('');

  const correctNodes = report.nodeResults.filter(r => r.isCorrect).length;
  const totalNodes = report.nodeResults.length;
  const accuracy = totalNodes > 0 ? Math.round((correctNodes / totalNodes) * 100) : 0;

  lines.push('-------------------------------------------');
  lines.push('决策详情:');
  for (let i = 0; i < report.nodeResults.length; i++) {
    const result = report.nodeResults[i];
    const status = result.isCorrect ? '✓' : '✗';
    lines.push(`  ${status} [${result.nodeDescription}] - ${result.choiceMade} (${result.timeSpent}s)`);
  }
  lines.push('-------------------------------------------');
  lines.push('');
  lines.push(`正确率: ${accuracy}% (${correctNodes}/${totalNodes})`);

  return lines.join('\n');
}

/**
 * Calculate score from stored attempt data (for replay from DB)
 */
export function calculateScoreFromStoredData(
  attempt: Attempt,
  nodeResults: NodeResult[]
): ScoreResult {
  const correctCount = nodeResults.filter(r => r.isCorrect).length;
  const totalCount = nodeResults.length;
  const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  // Difficulty multiplier
  const multiplier = getDifficultyMultiplier(attempt.difficulty);

  // Base score
  const baseScore = correctCount * 10;
  const difficultyBonus = Math.round(baseScore * (multiplier - 1));

  // Time bonus from remaining time
  const timeBonus = Math.round(attempt.remainingTime / 10);

  // Total
  const totalScore = Math.round(baseScore * multiplier + timeBonus);

  return {
    totalScore,
    accuracy,
    timeBonus,
    difficultyBonus,
    completed: attempt.completed,
    correctCount,
    totalCount,
  };
}