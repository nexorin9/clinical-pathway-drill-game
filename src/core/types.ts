// Clinical Pathway Decision Tree Types

export interface Condition {
  /** 条件字段（如 age, gender, symptoms 等） */
  field: string;
  /** 比较运算符（eq, gt, lt, gte, lte, in, contains） */
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
  /** 比较值 */
  value: string | number | string[];
}

export interface Node {
  /** 节点ID */
  id: string;
  /** 节点描述（如"患者主诉"） */
  description: string;
  /** 当前节点类型 */
  nodeType: 'admission' | 'decision' | 'action' | 'outcome';
  /** 准入条件（准入节点特有） */
  admissionCriteria?: Condition[];
  /** 选项列表 */
  choices: Choice[];
  /** 下一节点ID（action/outcome 节点） */
  nextNodeId?: string;
}

export interface Choice {
  /** 选项ID */
  id: string;
  /** 选项文本 */
  text: string;
  /** 是否正确选项 */
  isCorrect: boolean;
  /** 选择后跳转的下一节点ID */
  nextNodeId: string;
  /** 反馈文本（选择后显示） */
  feedback?: string;
  /** 时间奖励（秒） */
  timeBonus?: number;
}

export interface Pathway {
  /** 路径ID */
  id: string;
  /** 路径名称（如"急性阑尾炎临床路径"） */
  name: string;
  /** 路径描述 */
  description: string;
  /** 难度等级 */
  difficulty: 'easy' | 'medium' | 'hard';
  /** 准入条件节点 */
  admissionNode: Node;
  /** 决策节点列表 */
  decisionNodes: Node[];
  /** 起点节点ID */
  startNodeId: string;
}

export interface Tree {
  /** 根节点 */
  root: Node;
  /** 节点映射 */
  nodeMap: Map<string, Node>;
}

// Attempt & Score Types

export interface Attempt {
  /** 对局ID */
  attemptId: string;
  /** 路径ID */
  pathId: string;
  /** 玩家ID */
  playerId: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 当前节点ID */
  currentNodeId: string;
  /** 累计得分 */
  score: number;
  /** 是否完成 */
  completed: boolean;
  /** 节点日志 */
  nodeLogs: NodeLog[];
  /** 剩余时间（秒） */
  remainingTime: number;
  /** 难度等级 */
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface NodeLog {
  logId: string;
  attemptId: string;
  nodeId: string;
  choiceId: string;
  timeSpent: number;
}

export interface ScoreResult {
  /** 总分 */
  totalScore: number;
  /** 正确率 */
  accuracy: number;
  /** 时间奖励分 */
  timeBonus: number;
  /** 难度奖励分 */
  difficultyBonus: number;
  /** 完成状态 */
  completed: boolean;
  /** 正确选项数 */
  correctCount: number;
  /** 总选项数 */
  totalCount: number;
}

// Replay Types

export interface ReplayReport {
  attemptId: string;
  pathId: string;
  pathName: string;
  playerId: string;
  startTime: number;
  endTime: number;
  totalScore: number;
  completed: boolean;
  nodeResults: NodeResult[];
  markdown: string;
}

export interface NodeResult {
  nodeId: string;
  nodeDescription: string;
  choiceMade: string;
  isCorrect: boolean;
  feedback: string;
  timeSpent: number;
  scoreEarned: number;
}

// Scenario Types

export interface Scenario {
  /** 场景ID */
  id: string;
  /** 场景名称 */
  name: string;
  /** 主诉 */
  chiefComplaint: string;
  /** 体征数据 */
  vitalSigns: VitalSigns;
  /** 检验结果 */
  labResults: LabResult[];
  /** 影像学结果 */
  imagingResults?: ImagingResult[];
  /** 路径ID */
  pathId: string;
}

export interface VitalSigns {
  temperature?: number;
  heartRate?: number;
  bloodPressure?: string;
  respiratoryRate?: number;
  spo2?: number;
}

export interface LabResult {
  name: string;
  value: string | number;
  unit: string;
  referenceRange?: string;
  isAbnormal?: boolean;
}

export interface ImagingResult {
  type: string;
  finding: string;
}

// Leaderboard Types

export interface PlayerScore {
  playerId: string;
  totalScore: number;
  gameCount: number;
  winCount: number;
  winRate: number;
  avgScorePerGame: number;
}

// Config Types

export interface Config {
  dbPath: string;
  port: number;
  useLlm: boolean;
  defaultPlayer: string;
}
