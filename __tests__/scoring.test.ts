// Scoring Engine Unit Tests

import {
  calculateScore,
  calculateScoreFromStoredData,
  formatReplayMarkdown,
  formatReplayText,
} from '../src/core/scoring';
import { Attempt, NodeResult, ReplayReport } from '../src/core/types';

import { describe, it, expect } from '@jest/globals';

describe('Scoring Engine', () => {
  describe('calculateScoreFromStoredData', () => {
    it('should calculate score correctly for medium difficulty', () => {
      const attempt: Attempt = {
        attemptId: 'attempt_test_1',
        pathId: 'test_path',
        playerId: 'player1',
        startTime: Date.now() - 120000,
        endTime: Date.now(),
        currentNodeId: 'outcome_success',
        score: 0,
        completed: true,
        nodeLogs: [],
        remainingTime: 60,
        difficulty: 'medium',
      };

      const nodeResults: NodeResult[] = [
        {
          nodeId: 'admission_1',
          nodeDescription: '患者入院',
          choiceMade: 'choice_a1',
          isCorrect: true,
          feedback: 'Correct',
          timeSpent: 10,
          scoreEarned: 15,
        },
        {
          nodeId: 'decision_1',
          nodeDescription: '选择治疗方案',
          choiceMade: 'choice_d1',
          isCorrect: true,
          feedback: 'Correct',
          timeSpent: 15,
          scoreEarned: 15,
        },
      ];

      const result = calculateScoreFromStoredData(attempt, nodeResults);

      expect(result.totalCount).toBe(2);
      expect(result.correctCount).toBe(2);
      expect(result.accuracy).toBe(100);
      expect(result.completed).toBe(true);
      expect(result.difficultyBonus).toBe(10); // 10 * 2 nodes * (1.5-1) = 10
    });

    it('should handle easy difficulty with correct score', () => {
      const attempt: Attempt = {
        attemptId: 'attempt_test_2',
        pathId: 'test_path',
        playerId: 'player1',
        startTime: Date.now() - 180000,
        endTime: Date.now(),
        currentNodeId: 'outcome_success',
        score: 0,
        completed: true,
        nodeLogs: [],
        remainingTime: 120,
        difficulty: 'easy',
      };

      const nodeResults: NodeResult[] = [
        {
          nodeId: 'admission_1',
          nodeDescription: '患者入院',
          choiceMade: 'choice_a1',
          isCorrect: true,
          feedback: 'Correct',
          timeSpent: 5,
          scoreEarned: 10,
        },
      ];

      const result = calculateScoreFromStoredData(attempt, nodeResults);

      expect(result.totalCount).toBe(1);
      expect(result.correctCount).toBe(1);
      expect(result.accuracy).toBe(100);
      expect(result.completed).toBe(true);
      expect(result.difficultyBonus).toBe(0); // easy has 1.0 multiplier, no bonus
    });

    it('should handle hard difficulty with higher multiplier', () => {
      const attempt: Attempt = {
        attemptId: 'attempt_test_3',
        pathId: 'test_path',
        playerId: 'player1',
        startTime: Date.now() - 60000,
        endTime: Date.now(),
        currentNodeId: 'outcome_success',
        score: 0,
        completed: true,
        nodeLogs: [],
        remainingTime: 30,
        difficulty: 'hard',
      };

      const nodeResults: NodeResult[] = [
        {
          nodeId: 'admission_1',
          nodeDescription: '患者入院',
          choiceMade: 'choice_a1',
          isCorrect: true,
          feedback: 'Correct',
          timeSpent: 8,
          scoreEarned: 20,
        },
        {
          nodeId: 'decision_1',
          nodeDescription: '选择治疗方案',
          choiceMade: 'choice_d2',
          isCorrect: false,
          feedback: 'Wrong',
          timeSpent: 5,
          scoreEarned: 0,
        },
      ];

      const result = calculateScoreFromStoredData(attempt, nodeResults);

      expect(result.totalCount).toBe(2);
      expect(result.correctCount).toBe(1);
      expect(result.accuracy).toBe(50);
      expect(result.completed).toBe(true);
    });

    it('should handle incomplete attempts', () => {
      const attempt: Attempt = {
        attemptId: 'attempt_test_4',
        pathId: 'test_path',
        playerId: 'player1',
        startTime: Date.now() - 300000,
        endTime: Date.now(),
        currentNodeId: 'decision_1',
        score: 15,
        completed: false,
        nodeLogs: [],
        remainingTime: 0,
        difficulty: 'medium',
      };

      const nodeResults: NodeResult[] = [
        {
          nodeId: 'admission_1',
          nodeDescription: '患者入院',
          choiceMade: 'choice_a1',
          isCorrect: true,
          feedback: 'Correct',
          timeSpent: 30,
          scoreEarned: 15,
        },
      ];

      const result = calculateScoreFromStoredData(attempt, nodeResults);

      expect(result.completed).toBe(false);
      expect(result.totalCount).toBe(1);
      expect(result.correctCount).toBe(1);
    });
  });

  describe('formatReplayMarkdown', () => {
    it('should format replay report as markdown', () => {
      const report: ReplayReport = {
        attemptId: 'attempt_123',
        pathId: 'acute_appendicitis',
        pathName: '急性阑尾炎临床路径',
        playerId: 'player1',
        startTime: Date.now() - 180000,
        endTime: Date.now(),
        totalScore: 85,
        completed: true,
        nodeResults: [
          {
            nodeId: 'admission_1',
            nodeDescription: '患者入院评估',
            choiceMade: '进行腹部检查',
            isCorrect: true,
            feedback: '正确选择',
            timeSpent: 15,
            scoreEarned: 15,
          },
        ],
        markdown: '',
      };

      const markdown = formatReplayMarkdown(report);

      expect(markdown).toContain('# 临床路径闯关复盘报告');
      expect(markdown).toContain('**对局ID**: attempt_123');
      expect(markdown).toContain('**路径**: 急性阑尾炎临床路径');
      expect(markdown).toContain('**总分**: 85');
      expect(markdown).toContain('## 决策详情');
      expect(markdown).toContain('正确选择');
    });

    it('should show duration correctly', () => {
      const report: ReplayReport = {
        attemptId: 'attempt_456',
        pathId: 'cap',
        pathName: '社区获得性肺炎',
        playerId: 'player1',
        startTime: Date.now() - 130000, // 2m10s ago
        endTime: Date.now(),
        totalScore: 70,
        completed: true,
        nodeResults: [],
        markdown: '',
      };

      const markdown = formatReplayMarkdown(report);

      expect(markdown).toContain('**用时**: 2分10秒');
    });
  });

  describe('formatReplayText', () => {
    it('should format replay as simple text', () => {
      const report: ReplayReport = {
        attemptId: 'attempt_789',
        pathId: 'stemi',
        pathName: 'ST段抬高心肌梗死',
        playerId: 'player1',
        startTime: Date.now() - 90000,
        endTime: Date.now(),
        totalScore: 55,
        completed: false,
        nodeResults: [
          {
            nodeId: 'admission_1',
            nodeDescription: '胸痛患者评估',
            choiceMade: '做心电图',
            isCorrect: true,
            feedback: '正确',
            timeSpent: 10,
            scoreEarned: 10,
          },
          {
            nodeId: 'decision_1',
            nodeDescription: '心电图结果判读',
            choiceMade: 'ST段抬高',
            isCorrect: false,
            feedback: '错误',
            timeSpent: 20,
            scoreEarned: 0,
          },
        ],
        markdown: '',
      };

      const text = formatReplayText(report);

      expect(text).toContain('═══════════════════════════════════════════');
      expect(text).toContain('临床路径闯关复盘');
      expect(text).toContain('路径: ST段抬高心肌梗死');
      expect(text).toContain('得分: 55');
      expect(text).toContain('状态: 未完成');
      expect(text).toContain('✓');
      expect(text).toContain('✗');
    });
  });
});