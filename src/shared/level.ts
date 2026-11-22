// 关卡台共享数据模型：作者内容、证明记录、可分享的关卡包
export type RelicId = "sun" | "vessel" | "tablet";

export type CellKind = "wall" | "floor" | "trap" | "door";
export type ToolKind = "probe" | "flare" | "shield";
export type ToolBag = Record<ToolKind, number>;

export interface CellSpec {
  id: number;
  kind: CellKind;
  /** 文物只能放置在 floor 上 */
  relic: RelicId | null;
}

export interface LevelContent {
  format: 1;
  width: number;
  height: number;
  name: string;
  author: string;
  cells: CellSpec[];
  /** 入口格 id，必须是 floor */
  start: number;
  tools: ToolBag;
  lives: number;
}

export type ProofStepKind = "reveal" | "probe" | "flare" | "shield" | "door";

export interface ProofStep {
  kind: ProofStepKind;
  cell: number | null;
  /** 基于公开约束的人类可读理由，不引用暗格答案 */
  reason: string;
}

export type ProofVerdict = "proved" | "unreachable" | "guess" | "cap";

export interface StuckConstraint {
  /** 发布数字的已探索格 */
  source: number;
  /** 数字格看到的未知格 */
  unknown: number[];
  /** 其中仍需存在的陷阱数 */
  remaining: number;
  text: string;
}

export interface StuckInfo {
  /** 卡住时所有可行动的未知前沿格 */
  frontier: number[];
  /** 当时成立的公开约束（数字方程） */
  constraints: StuckConstraint[];
  /** 已到达的文物格 */
  reachedRelics: number[];
  /** 未能到达的文物格 */
  missingRelics: number[];
  visitedStates: number;
  message: string;
}

export interface ProofRecord {
  verdict: ProofVerdict;
  /** 证明所对应的内容哈希；不一致则证明失效 */
  contentHash: string;
  steps: ProofStep[];
  toolsUsed: ToolBag;
  revealedSafe: number;
  totalSafe: number;
  nodeCount: number;
  stateCount: number;
  stuck: StuckInfo | null;
  checkedAt: number;
}

export interface LevelPackage {
  format: 1;
  kind: "ruinfield-level";
  content: LevelContent;
  /** 随包发布的证明；只有与 content 哈希一致且 verdict=proved 才有效 */
  proof: ProofRecord | null;
  createdAt: number;
}

export interface PlayResult {
  id: string;
  levelName: string;
  contentHash: string;
  outcome: "won" | "lost";
  relicsFound: RelicId[];
  mistakes: number;
  used: number;
  seconds: number;
  at: number;
  /** 成绩对应的内容版本是否仍与当前发布版本一致；过期成绩不计入榜单 */
  stale: boolean;
}

export function emptyToolBag(): ToolBag {
  return { probe: 0, flare: 0, shield: 0 };
}
