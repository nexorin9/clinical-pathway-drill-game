// Clinical Pathway Decision Tree Parser

import * as fs from 'fs';
import * as path from 'path';
import { Pathway, Node, Tree, Condition } from './types';

export class PathwayParseError extends Error {
  constructor(message: string, public readonly pathId?: string) {
    super(message);
    this.name = 'PathwayParseError';
  }
}

/**
 * Parse clinical pathway from JSON file
 */
export function parsePathwayFromFile(filePath: string): Pathway {
  if (!fs.existsSync(filePath)) {
    throw new PathwayParseError(`Pathway file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  let json: any;

  try {
    json = JSON.parse(content);
  } catch (e) {
    throw new PathwayParseError(`Invalid JSON in pathway file: ${(e as Error).message}`);
  }

  return parsePathway(json);
}

/**
 * Parse clinical pathway from JSON object
 */
export function parsePathway(json: any): Pathway {
  if (!json || typeof json !== 'object') {
    throw new PathwayParseError('Pathway must be an object');
  }

  // Validate required top-level fields
  if (!json.id || typeof json.id !== 'string') {
    throw new PathwayParseError('Pathway must have a string id field');
  }

  if (!json.name || typeof json.name !== 'string') {
    throw new PathwayParseError(`Pathway ${json.id || 'unknown'} must have a string name field`);
  }

  if (!json.difficulty || !['easy', 'medium', 'hard'].includes(json.difficulty)) {
    throw new PathwayParseError(`Pathway ${json.id} must have a valid difficulty (easy|medium|hard)`);
  }

  // Parse admission node
  if (!json.admissionNode || typeof json.admissionNode !== 'object') {
    throw new PathwayParseError(`Pathway ${json.id} must have an admissionNode object`);
  }

  const admissionNode = parseNode(json.admissionNode, true);

  // Parse decision nodes
  const decisionNodes: Node[] = [];
  if (Array.isArray(json.decisionNodes)) {
    for (const node of json.decisionNodes) {
      decisionNodes.push(parseNode(node, false));
    }
  }

  // Build pathway object
  const pathway: Pathway = {
    id: json.id,
    name: json.name,
    description: json.description || '',
    difficulty: json.difficulty,
    admissionNode,
    decisionNodes,
    startNodeId: json.startNodeId || json.admissionNode.id,
  };

  // Validate the pathway
  if (!validatePath(pathway)) {
    throw new PathwayParseError(`Pathway ${pathway.id} validation failed: invalid structure or disconnected nodes`);
  }

  return pathway;
}

/**
 * Parse a single node from JSON
 */
function parseNode(json: any, isAdmission: boolean): Node {
  if (!json.id || typeof json.id !== 'string') {
    throw new PathwayParseError('Node must have a string id field');
  }

  if (!json.description || typeof json.description !== 'string') {
    throw new PathwayParseError(`Node ${json.id} must have a string description field`);
  }

  const validNodeTypes = ['admission', 'decision', 'action', 'outcome'];
  const nodeType = json.nodeType || (isAdmission ? 'admission' : 'decision');

  if (!validNodeTypes.includes(nodeType)) {
    throw new PathwayParseError(`Node ${json.id} has invalid nodeType: ${nodeType}`);
  }

  const node: Node = {
    id: json.id,
    description: json.description,
    nodeType: nodeType as Node['nodeType'],
    choices: [],
    nextNodeId: json.nextNodeId,
  };

  // Parse admission criteria if present
  if (json.admissionCriteria) {
    if (!Array.isArray(json.admissionCriteria)) {
      throw new PathwayParseError(`Node ${node.id}: admissionCriteria must be an array`);
    }
    node.admissionCriteria = json.admissionCriteria.map((c: any) => parseCondition(c));
  }

  // Parse choices for decision nodes
  if (Array.isArray(json.choices)) {
    for (const choice of json.choices) {
      if (!choice.id || typeof choice.id !== 'string') {
        throw new PathwayParseError(`Node ${node.id}: choice must have a string id`);
      }
      if (!choice.text || typeof choice.text !== 'string') {
        throw new PathwayParseError(`Node ${node.id}: choice ${choice.id} must have a string text`);
      }
      if (typeof choice.isCorrect !== 'boolean') {
        throw new PathwayParseError(`Node ${node.id}: choice ${choice.id} must have a boolean isCorrect`);
      }
      if (!choice.nextNodeId || typeof choice.nextNodeId !== 'string') {
        throw new PathwayParseError(`Node ${node.id}: choice ${choice.id} must have a string nextNodeId`);
      }

      node.choices.push({
        id: choice.id,
        text: choice.text,
        isCorrect: choice.isCorrect,
        nextNodeId: choice.nextNodeId,
        feedback: choice.feedback,
        timeBonus: choice.timeBonus,
      });
    }
  }

  // Decision nodes must have at least one choice
  if (nodeType === 'decision' && node.choices.length === 0) {
    throw new PathwayParseError(`Node ${node.id} (decision type) must have at least one choice`);
  }

  // admission nodes should have at least one choice to proceed
  if (nodeType === 'admission' && node.choices.length === 0) {
    throw new PathwayParseError(`Node ${node.id} (admission type) must have at least one choice`);
  }

  return node;
}

/**
 * Parse a condition from JSON
 */
function parseCondition(json: any): Condition {
  if (!json.field || typeof json.field !== 'string') {
    throw new PathwayParseError('Condition must have a string field');
  }

  const validOperators = ['eq', 'gt', 'lt', 'gte', 'lte', 'in', 'contains'];
  if (!json.operator || !validOperators.includes(json.operator)) {
    throw new PathwayParseError(`Condition for field ${json.field}: invalid operator ${json.operator}`);
  }

  if (json.value === undefined) {
    throw new PathwayParseError(`Condition for field ${json.field}: missing value`);
  }

  return {
    field: json.field,
    operator: json.operator as Condition['operator'],
    value: json.value,
  };
}

/**
 * Validate a pathway structure
 * - Check required fields
 * - Check node connectivity (all referenced nodes must exist)
 * - Check start node exists
 */
export function validatePath(pathway: Pathway): boolean {
  // Check admission node
  if (!pathway.admissionNode || !pathway.admissionNode.id) {
    return false;
  }

  // Build node map for connectivity check
  const nodeMap = new Map<string, Node>();
  nodeMap.set(pathway.admissionNode.id, pathway.admissionNode);

  for (const node of pathway.decisionNodes) {
    if (nodeMap.has(node.id)) {
      // Duplicate node ID
      return false;
    }
    nodeMap.set(node.id, node);
  }

  // Check start node exists
  if (!nodeMap.has(pathway.startNodeId)) {
    return false;
  }

  // Check connectivity: all nextNodeId references must point to existing nodes
  for (const node of nodeMap.values()) {
    // Check choices' nextNodeId
    for (const choice of node.choices) {
      if (!nodeMap.has(choice.nextNodeId)) {
        return false;
      }
    }

    // Check node's own nextNodeId (for action/outcome nodes)
    if (node.nextNodeId && !nodeMap.has(node.nextNodeId)) {
      return false;
    }
  }

  // Check admission node has at least one choice (to proceed)
  if (pathway.admissionNode.choices.length === 0) {
    return false;
  }

  return true;
}

/**
 * Build a traversable decision tree from a pathway
 */
export function buildDecisionTree(pathway: Pathway): Tree {
  const nodeMap = new Map<string, Node>();

  // Add admission node
  nodeMap.set(pathway.admissionNode.id, pathway.admissionNode);

  // Add all decision nodes
  for (const node of pathway.decisionNodes) {
    nodeMap.set(node.id, node);
  }

  // Validate all nodes are reachable from start
  const visited = new Set<string>();
  const queue = [pathway.startNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) continue;

    for (const choice of node.choices) {
      if (!visited.has(choice.nextNodeId)) {
        queue.push(choice.nextNodeId);
      }
    }

    if (node.nextNodeId && !visited.has(node.nextNodeId)) {
      queue.push(node.nextNodeId);
    }
  }

  // All nodes in nodeMap should be reachable
  // Note: Some nodes might be unreachable if the pathway has dead ends
  // This is allowed for game purposes (player's wrong choice leads there)

  const root = nodeMap.get(pathway.startNodeId);
  if (!root) {
    throw new PathwayParseError(`Start node ${pathway.startNodeId} not found in tree`);
  }

  return {
    root,
    nodeMap,
  };
}

/**
 * Get all node IDs in a tree (for debugging/visualization)
 */
export function getAllNodeIds(tree: Tree): string[] {
  return Array.from(tree.nodeMap.keys());
}

/**
 * Get node by ID from tree
 */
export function getNodeById(tree: Tree, nodeId: string): Node | undefined {
  return tree.nodeMap.get(nodeId);
}

/**
 * Get the next nodes from a given node based on player choice
 */
export function getNextNodes(node: Node): Node[] {
  return node.choices.map(c => ({ ...c } as any));
}

/**
 * Check if a node is an end node (no choices and no nextNodeId)
 */
export function isEndNode(node: Node): boolean {
  return node.choices.length === 0 && !node.nextNodeId;
}