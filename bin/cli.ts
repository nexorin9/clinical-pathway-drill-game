#!/usr/bin/env node
// Clinical Pathway Drill Game - CLI Entry Point

import { Command }from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { gameEngine, preloadPathway } from '../src/core/game-engine';
import { parsePathwayFromFile, validatePath } from '../src/core/parser';
import { scenarioGenerator, serializeScenario } from '../src/core/scenario-generator';
import { generateReplay, formatReplayMarkdown } from '../src/core/scoring';
import { initDatabase, getDb } from '../src/db/init';
import { exportHistory } from '../src/db/repo';
import chalk from 'chalk';

const program = new Command();

// Helper to get data directory
function getDataDir(): string {
  return path.join(__dirname, '..', '..', 'data');
}

// Helper to load all pathways
function loadAllPathways(): Array<{ id: string; name: string; difficulty: string; description: string }> {
  const dataDir = getDataDir();
  const pathwaysDir = path.join(dataDir, 'pathways');
  const indexPath = path.join(pathwaysDir, 'index.json');

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const index = JSON.parse(indexContent);
  const pathways: Array<{ id: string; name: string; difficulty: string; description: string }> = [];

  for (const item of index.pathways || []) {
    // Handle both string IDs and object entries
    const pathId = typeof item === 'string' ? item : item.id;
    const filePath = path.join(pathwaysDir, `${pathId}.json`);
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

// Initialize database
function ensureDbInitialized(): void {
  const dbPath = path.join(getDataDir(), 'clinic_paths.db');
  if (!fs.existsSync(dbPath)) {
    initDatabase();
  }
}

// =====================
// Command: list
// =====================
program
  .command('list')
  .description('列出所有可用的临床路径')
  .action(() => {
    ensureDbInitialized();
    const pathways = loadAllPathways();

    if (pathways.length === 0) {
      console.log('暂无可用的临床路径。请先运行 npm run seed 加载示例数据。');
      return;
    }

    console.log(chalk.cyan('═══════════════════════════════════════════'));
    console.log(chalk.cyan('         ') + chalk.bold('临床路径清单') + chalk.cyan('          '));
    console.log(chalk.cyan('═══════════════════════════════════════════'));
    console.log('');

    const difficultyBadge: Record<string, string> = {
      easy: chalk.green('🟢 简单'),
      medium: chalk.yellow('🟡 中等'),
      hard: chalk.red('🔴 困难'),
    };

    for (let i = 0; i < pathways.length; i++) {
      const p = pathways[i];
      console.log(`${chalk.cyan(String(i + 1) + '.')} ${chalk.white(p.name)} ${chalk.gray('[')}${difficultyBadge[p.difficulty]}${chalk.gray(']')}`);
      console.log(`   ${chalk.gray('ID:')} ${chalk.cyan(p.id)}`);
      if (p.description) {
        console.log(`   ${chalk.gray(p.description)}`);
      }
      console.log('');
    }

    console.log(chalk.gray('使用命令:'));
    console.log(`  ${chalk.green('npm start -- list')}              ${chalk.gray('# 查看所有路径')}`);
    console.log(`  ${chalk.green('npm start -- info <pathId>')}     ${chalk.gray('# 查看路径详情')}`);
    console.log(`  ${chalk.green('npm start -- start <pathId>')}    ${chalk.gray('# 开始新对局')}`);
  });

// =====================
// Command: info <pathId>
// =====================
program
  .command('info <pathId>')
  .description('显示临床路径详情')
  .option('-p, --player <id>', '指定玩家ID', 'player1')
  .action((pathId: string, options: { player: string }) => {
    ensureDbInitialized();
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, 'pathways', `${pathId}.json`);

    if (!fs.existsSync(filePath)) {
      console.error(`错误: 路径 ${pathId} 不存在`);
      console.log('使用 npm start -- list 查看所有可用路径');
      return;
    }

    try {
      const pathway = parsePathwayFromFile(filePath);

      const difficultyBadge: Record<string, string> = {
        easy: chalk.green('🟢 简单'),
        medium: chalk.yellow('🟡 中等'),
        hard: chalk.red('🔴 困难'),
      };

      console.log(chalk.cyan('═══════════════════════════════════════════'));
      console.log(chalk.cyan('  ') + chalk.bold(`${pathway.name}`));
      console.log(chalk.cyan('═══════════════════════════════════════════'));
      console.log('');
      console.log(chalk.gray(`路径ID: ${pathway.id}`));
      console.log(chalk.gray(`难度: `) + difficultyBadge[pathway.difficulty]);
      console.log(chalk.gray(`描述: `) + (pathway.description || '无'));
      console.log('');

      console.log(chalk.bold('【准入条件】'));
      const admission = pathway.admissionNode;
      console.log(`  ${chalk.white(admission.description)}`);
      if (admission.admissionCriteria && admission.admissionCriteria.length > 0) {
        for (const cond of admission.admissionCriteria) {
          console.log(`  ${chalk.gray('-')} ${chalk.white(cond.field)} ${chalk.yellow(cond.operator)} ${chalk.green(cond.value)}`);
        }
      } else {
        console.log(`  ${chalk.gray('(无特殊准入条件)')}`);
      }
      console.log('');

      console.log(chalk.bold('【决策节点】'));
      for (const node of pathway.decisionNodes) {
        console.log(`  ${chalk.cyan(`[${node.id}]`)} ${chalk.white(node.description)}`);
        for (const choice of node.choices) {
          const correctMark = choice.isCorrect ? chalk.green('✓') : ' ';
          console.log(`    ${correctMark} ${chalk.gray(choice.id)}: ${chalk.white(choice.text)}`);
        }
      }
      console.log('');

      console.log('游戏命令:');
      console.log(`  npm start -- start ${pathId} --player ${options.player}`);
    } catch (e) {
      console.error(`解析路径失败: ${(e as Error).message}`);
    }
  });

// =====================
// Command: start <pathId>
// =====================
program
  .command('start <pathId>')
  .description('开始新的临床路径闯关')
  .option('-p, --player <id>', '指定玩家ID', 'player1')
  .action((pathId: string, options: { player: string }) => {
    ensureDbInitialized();
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, 'pathways', `${pathId}.json`);

    if (!fs.existsSync(filePath)) {
      console.error(`错误: 路径 ${pathId} 不存在`);
      console.log('使用 npm start -- list 查看所有可用路径');
      return;
    }

    // Load and validate pathway
    const pathway = parsePathwayFromFile(filePath);
    if (!validatePath(pathway)) {
      console.error('路径结构验证失败');
      return;
    }

    // Pre-load pathway into engine cache for synchronous startGame
    preloadPathway(pathId, filePath);

    // Save pathway to DB if not exists
    const db = getDb();
    db.get('SELECT path_id FROM paths WHERE path_id = ?', [pathId], (err, row: any) => {
      if (err || !row) {
        // Insert pathway into DB
        db.run(
          `INSERT INTO paths (path_id, name, description, difficulty, start_node_id, data_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [pathId, pathway.name, pathway.description, pathway.difficulty, pathway.startNodeId, JSON.stringify(pathway)],
          (insertErr) => {
            if (insertErr) {
              console.error('保存路径失败:', insertErr.message);
            }
          }
        );
      }
    });

    // Generate scenario
    const scenario = scenarioGenerator.generateScenario(pathId, pathway.difficulty);

    const difficultyBadge: Record<string, string> = {
      easy: chalk.green('🟢 简单'),
      medium: chalk.yellow('🟡 中等'),
      hard: chalk.red('🔴 困难'),
    };

    console.log(chalk.cyan('═══════════════════════════════════════════'));
    console.log(chalk.cyan('  临床路径闯关 - 新对局'));
    console.log(chalk.cyan('═══════════════════════════════════════════'));
    console.log('');
    console.log(chalk.gray(`路径: `) + chalk.bold(pathway.name));
    console.log(chalk.gray(`难度: `) + difficultyBadge[pathway.difficulty]);
    console.log(chalk.gray(`玩家: `) + chalk.magenta(options.player));
    console.log('');
    console.log(chalk.bold('【患者信息】'));
    console.log(chalk.white(serializeScenario(scenario)));
    console.log('');

    // Start game
    const attempt = gameEngine.startGame(pathId, options.player);

    // Progress bar for decision nodes
    const totalNodes = pathway.decisionNodes.length;
    const progressBar = (current: number, total: number) => {
      const filled = Math.round((current / total) * 10);
      const empty = 10 - filled;
      return `${chalk.green('█'.repeat(filled))}${chalk.gray('░'.repeat(empty))} ${current}/${total}`;
    };

    console.log(`${chalk.gray('对局已创建:')} ${chalk.cyan(attempt.attemptId)}`);
    console.log(`${chalk.gray('剩余时间:')} ${chalk.yellow(Math.floor(attempt.remainingTime / 60) + '分' + (attempt.remainingTime % 60) + '秒')}`);
    console.log(`${chalk.gray('进度:')} ${progressBar(0, totalNodes)}`);
    console.log('');
    console.log(`${chalk.gray('提示:')} ${chalk.green('使用 choice 命令提交选择')}`);
    console.log('');
  });

// =====================
// Command: choice <attemptId> <choiceId>
// =====================
program
  .command('choice <attemptId> <choiceId>')
  .description('提交选择')
  .option('-t, --time <seconds>', '决策耗时（秒）', '10')
  .action((attemptId: string, choiceId: string, options: { time: string }) => {
    ensureDbInitialized();

    const timeSpent = parseInt(options.time) || 10;

    try {
      // Load attempt from DB synchronously via spin
      const db = getDb();
      let attemptRow: any = null;
      let attemptDone = false;

      db.get('SELECT * FROM attempts WHERE attempt_id = ?', [attemptId], (err, row) => {
        attemptRow = row;
        attemptDone = true;
      });

      while (!attemptDone) { /* spin wait */ }

      if (!attemptRow) {
        console.error(`对局 ${attemptId} 不存在`);
        return;
      }

      // Reconstruct attempt object
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
        console.error('对局已结束，请使用 replay 命令查看复盘');
        return;
      }

      // Load pathway from file and preload into engine
      const dataDir = getDataDir();
      const filePath = path.join(dataDir, 'pathways', `${attempt.pathId}.json`);
      if (!fs.existsSync(filePath)) {
        console.error(`路径文件 ${attempt.pathId}.json 不存在`);
        return;
      }

      preloadPathway(attempt.pathId, filePath);

      const pathway = (global as any).pathwayCache?.get(attempt.pathId);
      if (!pathway) {
        console.error(`无法加载路径 ${attempt.pathId}`);
        return;
      }

      // Get current node from tree
      const tree = (global as any).treeCache?.get(attempt.pathId);
      if (!tree) {
        console.error(`无法构建决策树`);
        return;
      }

      const currentNode = tree.nodeMap.get(attempt.currentNodeId);
      if (!currentNode) {
        console.error(`当前节点 ${attempt.currentNodeId} 不存在`);
        return;
      }

      console.log(`当前节点: ${currentNode.description}`);
      console.log(`选择: ${choiceId}`);

      // Find the selected choice
      const selectedChoice = currentNode.choices.find((c: any) => c.id === choiceId);
      if (!selectedChoice) {
        console.error(`选项 ${choiceId} 不存在`);
        return;
      }

      // Log the choice
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.run(
        'INSERT INTO node_logs (log_id, attempt_id, node_id, choice_id, time_spent) VALUES (?, ?, ?, ?, ?)',
        [logId, attemptId, attempt.currentNodeId, choiceId, timeSpent],
        (err) => { if (err) console.error('保存日志失败:', err.message); }
      );

      // Move to next node
      const newNodeId = selectedChoice.nextNodeId;

      // Apply time bonus if any
      let newRemainingTime = attempt.remainingTime;
      if (selectedChoice.timeBonus) {
        const timeLimit = attempt.difficulty === 'easy' ? 300 : attempt.difficulty === 'medium' ? 180 : 120;
        newRemainingTime = Math.min(newRemainingTime + selectedChoice.timeBonus, timeLimit);
      }

      // Calculate score if correct
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

      // Check if this was the last node (outcome node)
      const newNode = tree.nodeMap.get(newNodeId);
      const isOutcome = newNode?.nodeType === 'outcome' || (!newNode?.choices?.length && newNode?.nodeType === 'action');
      const completed = isOutcome || !newNode;

      // Update attempt in DB
      db.run(
        'UPDATE attempts SET current_node_id = ?, remaining_time = ?, score = score + ?, completed = ? WHERE attempt_id = ?',
        [newNodeId, newRemainingTime, scoreEarned, completed ? 1 : 0, attemptId],
        (err) => { if (err) console.error('更新失败:', err.message); }
      );

      // Animate score addition (Node.js compatible)
      const animateScore = (from: number, to: number, duration: number = 1000) => {
        const start = Date.now();
        const update = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const current = Math.round(from + (to - from) * progress);
          process.stdout.write(`\r${chalk.cyan('积分滚动:')} ${chalk.bold(current.toString().padStart(4))} `);
          if (progress < 1) setImmediate(update);
          else console.log('');
        };
        setImmediate(update);
      };

      if (correct) {
        console.log('');
        console.log(chalk.green('✓ 选择正确!'));
        const oldScore = attempt.score;
        const newScore = oldScore + scoreEarned;
        animateScore(oldScore, newScore);
      } else {
        console.log('');
        console.log(chalk.red('✗ 选择错误'));
      }

      // Check if time is running low
      const timeLimit = attempt.difficulty === 'easy' ? 300 : attempt.difficulty === 'medium' ? 180 : 120;
      const timePercent = (newRemainingTime / timeLimit) * 100;
      let timeColor = chalk.green;
      if (timePercent < 20) timeColor = chalk.red;
      else if (timePercent < 40) timeColor = chalk.yellow;

      if (completed) {
        console.log('');
        console.log(chalk.cyan('═══════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.bold('对局结束!'));
        console.log(chalk.cyan('═══════════════════════════════════════════'));
        console.log(`${chalk.gray('最终得分:')} ${chalk.bold(chalk.yellow(String(attempt.score + scoreEarned)))}`);
        console.log(`${chalk.gray('对局ID:')} ${chalk.cyan(attemptId)}`);
        console.log(`${chalk.gray('剩余时间:')} ${timeColor(Math.floor(newRemainingTime / 60) + '分' + (newRemainingTime % 60) + '秒')}`);
        console.log('');
        console.log(`${chalk.gray('查看复盘:')} ${chalk.green('npm start -- replay ' + attemptId)}`);
      } else {
        const nextNode = tree.nodeMap.get(newNodeId);
        if (nextNode) {
          console.log('');
          console.log(`${chalk.gray('下一节点:')} ${chalk.white(nextNode.description)}`);
          console.log(`${chalk.gray('剩余时间:')} ${timeColor(Math.floor(newRemainingTime / 60) + '分' + (newRemainingTime % 60) + '秒')}`);
          // Timeout warning
          if (timePercent < 20) {
            console.log(chalk.red.bold('⚠ 时间紧迫! 尽快做出选择!'));
          } else if (timePercent < 40) {
            console.log(chalk.yellow('⚠ 时间不多，注意决策节奏'));
          }
        }
      }
    } catch (e) {
      console.error(`错误: ${(e as Error).message}`);
    }
  });

// =====================
// Command: score <attemptId>
// =====================
program
  .command('score <attemptId>')
  .description('显示历史对局积分')
  .action((attemptId: string) => {
    ensureDbInitialized();

    try {
      const attempt = gameEngine.getAttempt(attemptId);
      if (!attempt) {
        // Try to load from DB
        const db = getDb();
        db.get('SELECT * FROM attempts WHERE attempt_id = ?', [attemptId], (err, row: any) => {
          if (err || !row) {
            console.error(`对局 ${attemptId} 不存在`);
            return;
          }

          console.log('═══════════════════════════════════════════');
          console.log('  对局记录');
          console.log('═══════════════════════════════════════════');
          console.log('');
          console.log(`对局ID: ${row.attempt_id}`);
          console.log(`路径ID: ${row.path_id}`);
          console.log(`玩家: ${row.player_id}`);
          console.log(`开始时间: ${new Date(row.start_time).toLocaleString('zh-CN')}`);
          console.log(`结束时间: ${row.end_time ? new Date(row.end_time).toLocaleString('zh-CN') : '进行中'}`);
          console.log(`得分: ${row.score}`);
          console.log(`状态: ${row.completed ? '已完成' : '进行中'}`);
          console.log('');
        });
        return;
      }

      console.log('═══════════════════════════════════════════');
      console.log('  对局详情');
      console.log('═══════════════════════════════════════════');
      console.log('');
      console.log(`对局ID: ${attempt.attemptId}`);
      console.log(`路径ID: ${attempt.pathId}`);
      console.log(`玩家: ${attempt.playerId}`);
      console.log(`开始时间: ${new Date(attempt.startTime).toLocaleString('zh-CN')}`);
      console.log(`结束时间: ${attempt.endTime ? new Date(attempt.endTime).toLocaleString('zh-CN') : '进行中'}`);
      console.log(`得分: ${attempt.score}`);
      console.log(`状态: ${attempt.completed ? '已完成' : '进行中'}`);
      console.log('');
    } catch (e) {
      console.error(`错误: ${(e as Error).message}`);
    }
  });

// =====================
// Command: replay <attemptId>
// =====================
program
  .command('replay <attemptId>')
  .description('回放历史对局复盘')
  .option('-m, --markdown', '输出 Markdown 格式', false)
  .action(async (attemptId: string, options: { markdown: boolean }) => {
    ensureDbInitialized();

    try {
      const attempt = gameEngine.getAttempt(attemptId);
      if (!attempt) {
        console.error(`对局 ${attemptId} 不存在`);
        return;
      }

      const report = await generateReplay(attempt);

      if (options.markdown) {
        console.log(report.markdown);
      } else {
        console.log(formatReplayMarkdown(report));
      }
    } catch (e) {
      console.error(`错误: ${(e as Error).message}`);
    }
  });

// =====================
// Command: leaderboard
// =====================
program
  .command('leaderboard')
  .description('查看玩家积分排行')
  .option('-m, --month <year-month>', '月度排行，如 2024-01', '')
  .option('-t, --type <type>', '排行类型: all（月度）/ winrate（胜率）/ total（总分）', 'total')
  .action((options: { month: string; type: string }) => {
    ensureDbInitialized();
    const db = getDb();

    let sql: string;
    let title: string;

    if (options.type === 'winrate') {
      sql = `SELECT p.player_id, p.name,
                    COUNT(a.attempt_id) as game_count,
                    SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) as win_count,
                    CAST(SUM(CASE WHEN a.completed = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(a.attempt_id) * 100 as win_rate,
                    COALESCE(SUM(a.score), 0) as total_score,
                    CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avg_score
             FROM players p
             LEFT JOIN attempts a ON p.player_id = a.player_id
             GROUP BY p.player_id
             ORDER BY win_rate DESC
             LIMIT 10`;
      title = '胜率排行';
    } else if (options.type === 'all' && options.month) {
      const [year, month] = options.month.split('-').map(Number);
      const startTime = new Date(year, month - 1, 1).getTime();
      const endTime = new Date(year, month, 1).getTime();
      sql = `SELECT p.player_id, p.name,
                    COUNT(a.attempt_id) as game_count,
                    COALESCE(SUM(a.score), 0) as total_score,
                    CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avg_score
             FROM players p
             LEFT JOIN attempts a ON p.player_id = a.player_id AND a.start_time >= ${startTime} AND a.start_time < ${endTime}
             GROUP BY p.player_id
             ORDER BY total_score DESC
             LIMIT 10`;
      title = `${options.month} 月度排行`;
    } else {
      sql = `SELECT p.player_id, p.name,
                    COUNT(a.attempt_id) as game_count,
                    COALESCE(SUM(a.score), 0) as total_score,
                    CAST(COALESCE(SUM(a.score), 0) AS FLOAT) / COUNT(a.attempt_id) as avg_score
             FROM players p
             LEFT JOIN attempts a ON p.player_id = a.player_id
             GROUP BY p.player_id
             ORDER BY total_score DESC
             LIMIT 10`;
      title = '总分排行';
    }

    db.all(sql, (err, rows: any[]) => {
      if (err) {
        console.error('查询失败:', err.message);
        return;
      }

      console.log('═══════════════════════════════════════════');
      console.log(`  ${title}`);
      console.log('═══════════════════════════════════════════');
      console.log('');

      if (rows.length === 0) {
        console.log('暂无排行数据');
        return;
      }

      const medal = ['🥇', '🥈', '🥉'];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rank = i < 3 ? medal[i] : `${i + 1}.`;
        const winRateInfo = row.win_rate !== undefined ? ` 胜率${row.win_rate.toFixed(1)}%` : '';
        console.log(`${rank} ${row.name} (${row.player_id})`);
        console.log(`   总分: ${row.total_score} | 局数: ${row.game_count}${winRateInfo} | 均分: ${row.avg_score?.toFixed(1) || 0}`);
        console.log('');
      }
    });
  });

// =====================
// Command: export-history
// =====================
program
  .command('export-history')
  .description('导出不同时长的对局历史')
  .option('-f, --format <format>', '导出格式: csv 或 json', 'json')
  .option('-o, --output <file>', '输出文件路径', '')
  .action((options: { format: string; output: string }) => {
    ensureDbInitialized();

    const format = options.format === 'csv' ? 'csv' : 'json';
    const output = exportHistory(format, 100);

    if (options.output) {
      fs.writeFileSync(options.output, output, 'utf-8');
      console.log(`已导出到: ${options.output}`);
    } else {
      console.log(output);
    }
  });

// Main entry
program
  .name('clinical-pathway-drill')
  .description('临床路径闯关游戏 - CLI')
  .version('1.0.0');

program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}