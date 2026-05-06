import { parsePathway, validatePath, buildDecisionTree, PathwayParseError } from '../src/core/parser';
import { Node } from '../src/core/types';

// Mock Pathway for testing
const validPathway = {
  id: 'test-pathway',
  name: 'Test Clinical Pathway',
  description: 'A test pathway',
  difficulty: 'medium',
  startNodeId: 'admission-1',
  admissionNode: {
    id: 'admission-1',
    description: 'Patient admission',
    nodeType: 'admission',
    choices: [
      {
        id: 'choice-1',
        text: 'Proceed to diagnosis',
        isCorrect: true,
        nextNodeId: 'decision-1',
        feedback: 'Correct!',
        timeBonus: 10,
      },
      {
        id: 'choice-2',
        text: 'Send home',
        isCorrect: false,
        nextNodeId: 'outcome-wrong',
        feedback: 'Wrong choice',
      },
    ],
  },
  decisionNodes: [
    {
      id: 'decision-1',
      description: 'Make diagnosis decision',
      nodeType: 'decision',
      choices: [
        {
          id: 'choice-d1',
          text: 'Order blood tests',
          isCorrect: true,
          nextNodeId: 'action-1',
          feedback: 'Good choice',
          timeBonus: 5,
        },
        {
          id: 'choice-d2',
          text: 'Prescribe antibiotics',
          isCorrect: false,
          nextNodeId: 'outcome-wrong',
          feedback: 'Not appropriate',
        },
      ],
    },
    {
      id: 'action-1',
      description: 'Review test results',
      nodeType: 'action',
      nextNodeId: 'outcome-correct',
    },
    {
      id: 'outcome-correct',
      description: 'Successful treatment',
      nodeType: 'outcome',
    },
    {
      id: 'outcome-wrong',
      description: 'Wrong treatment path',
      nodeType: 'outcome',
    },
  ],
};

describe('parser', () => {
  describe('parsePathway', () => {
    it('should parse a valid pathway object', () => {
      const pathway = parsePathway(validPathway);

      expect(pathway.id).toBe('test-pathway');
      expect(pathway.name).toBe('Test Clinical Pathway');
      expect(pathway.difficulty).toBe('medium');
      expect(pathway.admissionNode.id).toBe('admission-1');
      expect(pathway.decisionNodes.length).toBe(4);
    });

    it('should throw PathwayParseError for missing id', () => {
      const invalidPathway = { ...validPathway, id: undefined };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
      expect(() => parsePathway(invalidPathway)).toThrow('must have a string id field');
    });

    it('should throw PathwayParseError for missing name', () => {
      const invalidPathway = { ...validPathway, name: undefined };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should throw PathwayParseError for invalid difficulty', () => {
      const invalidPathway = { ...validPathway, difficulty: 'impossible' };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should throw PathwayParseError for missing admissionNode', () => {
      const invalidPathway = { ...validPathway, admissionNode: undefined };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should throw PathwayParseError for admission node without choices', () => {
      const invalidPathway = {
        ...validPathway,
        admissionNode: { id: 'admission-1', description: 'Test', nodeType: 'admission', choices: [] },
      };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should throw PathwayParseError for decision node without choices', () => {
      const invalidPathway = {
        ...validPathway,
        decisionNodes: [
          { id: 'decision-1', description: 'Test', nodeType: 'decision', choices: [] },
        ],
      };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should throw PathwayParseError for choice with missing fields', () => {
      const invalidPathway = {
        ...validPathway,
        admissionNode: {
          id: 'admission-1',
          description: 'Test',
          nodeType: 'admission',
          choices: [{ id: 'c1', text: 'Test' }],
        },
      };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should throw PathwayParseError for invalid nodeType', () => {
      const invalidPathway = {
        ...validPathway,
        admissionNode: {
          ...validPathway.admissionNode,
          nodeType: 'invalid',
        },
      };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });

    it('should parse admission criteria correctly', () => {
      const pathwayWithCriteria = {
        ...validPathway,
        admissionNode: {
          ...validPathway.admissionNode,
          admissionCriteria: [
            { field: 'age', operator: 'gte', value: 18 },
            { field: 'gender', operator: 'eq', value: 'male' },
          ],
        },
      };
      const pathway = parsePathway(pathwayWithCriteria);
      expect(pathway.admissionNode.admissionCriteria).toHaveLength(2);
      expect(pathway.admissionNode.admissionCriteria![0].field).toBe('age');
      expect(pathway.admissionNode.admissionCriteria![0].operator).toBe('gte');
      expect(pathway.admissionNode.admissionCriteria![0].value).toBe(18);
    });

    it('should throw for invalid condition operator', () => {
      const invalidPathway = {
        ...validPathway,
        admissionNode: {
          ...validPathway.admissionNode,
          admissionCriteria: [{ field: 'age', operator: 'invalid', value: 18 }],
        },
      };
      expect(() => parsePathway(invalidPathway)).toThrow(PathwayParseError);
    });
  });

  describe('validatePath', () => {
    it('should return true for a valid pathway', () => {
      const pathway = parsePathway(validPathway);
      expect(validatePath(pathway)).toBe(true);
    });

    it('should return false for pathway with duplicate node IDs', () => {
      // Parse a valid pathway first
      const basePathway = parsePathway(validPathway);

      // Manually add a duplicate node to the decisionNodes array
      const duplicateNode: Node = {
        id: 'decision-1', // This ID already exists in basePathway
        description: 'Duplicate node',
        nodeType: 'decision',
        choices: [
          {
            id: 'dup-choice',
            text: 'Test',
            isCorrect: false,
            nextNodeId: 'outcome-correct',
          },
        ],
      };
      (basePathway.decisionNodes as Node[]).push(duplicateNode);

      // Now validatePath should return false due to duplicate ID
      expect(validatePath(basePathway)).toBe(false);
    });

    it('should return false for pathway with invalid start node', () => {
      const pathway = parsePathway(validPathway);
      pathway.startNodeId = 'non-existent-node';
      expect(validatePath(pathway)).toBe(false);
    });

    it('should return false for pathway with disconnected nodes', () => {
      const pathway = parsePathway(validPathway);
      // Modify a choice to point to non-existent node
      (pathway.admissionNode.choices[0] as any).nextNodeId = 'ghost-node';
      expect(validatePath(pathway)).toBe(false);
    });
  });

  describe('buildDecisionTree', () => {
    it('should build a valid decision tree', () => {
      const pathway = parsePathway(validPathway);
      const tree = buildDecisionTree(pathway);

      expect(tree.root.id).toBe('admission-1');
      expect(tree.nodeMap.size).toBe(5); // 1 admission + 4 decision nodes
    });

    it('should include all nodes in nodeMap', () => {
      const pathway = parsePathway(validPathway);
      const tree = buildDecisionTree(pathway);

      expect(tree.nodeMap.has('admission-1')).toBe(true);
      expect(tree.nodeMap.has('decision-1')).toBe(true);
      expect(tree.nodeMap.has('action-1')).toBe(true);
      expect(tree.nodeMap.has('outcome-correct')).toBe(true);
      expect(tree.nodeMap.has('outcome-wrong')).toBe(true);
    });

    it('should throw for invalid start node', () => {
      const pathway = parsePathway(validPathway);
      pathway.startNodeId = 'ghost';
      expect(() => buildDecisionTree(pathway)).toThrow(PathwayParseError);
    });
  });
});