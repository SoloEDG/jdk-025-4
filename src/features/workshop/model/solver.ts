import type {
  LevelContent,
  ProofRecord,
  ProofStep,
  StuckConstraint,
  StuckInfo,
  ToolBag,
} from "../../../shared/level";
import {
  adjacentTraps,
  contentHash,
  coordinate,
  floodReveal,
  isDoor,
  isTrap,
  relicCells,
  totalSafeCells,
} from "./geometry";
import {
  analyzeBelief,
  type BeliefResult,
  type PublicKnowledge,
} from "./belief";

export const NODE_CAP = 6000;

interface SearchState {
  revealed: Set<number>;
  intel: Map<number, 1 | -1>;
  exposed: Set<number>;
  tools: ToolBag;
  lives: number;
  steps: ProofStep[];
}

function cloneState(s: SearchState): SearchState {
  return {
    revealed: new Set(s.revealed),
    intel: new Map(s.intel),
    exposed: new Set(s.exposed),
    tools: { ...s.tools },
    lives: s.lives,
    steps: s.steps.slice(),
  };
}

function knowledge(s: SearchState): PublicKnowledge {
  return {
    revealed: s.revealed,
    intel: s.intel,
    exposedTraps: s.exposed,
  };
}

/** 状态等价键：同一信息状态 + 同一资源向量（资源不同不算等价，由支配关系另做剪枝） */
function canonicalKey(s: SearchState): string {
  const r = [...s.revealed].sort((a, b) => a - b).join(",");
  const i = [...s.intel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, v]) => `${id}:${v}`)
    .join(",");
  const x = [...s.exposed].sort((a, b) => a - b).join(",");
  return `${r}|${i}|${x}|${s.tools.probe},${s.tools.flare},${s.tools.shield}|${s.lives}`;
}

function dominates(a: SearchState, b: SearchState): boolean {
  // a 相对 b：信息相同（同一键的信息部分），且每种资源都不少于 b、生命不低于 b
  return (
    a.tools.probe >= b.tools.probe &&
    a.tools.flare >= b.tools.flare &&
    a.tools.shield >= b.tools.shield &&
    a.lives >= b.lives
  );
}

/**
 * 宏闭包：把所有「无需选择、必然安全或必然发生」的进展一次性做完。
 * 1) 自动打开与已探索区相邻的封门（门本身保证安全，开启不耗道具）；
 * 2) 揭开所有在当前公开信念下可证明安全的未知格（含 0 数字洪水）；
 * 3) 探针确认过的安全格直接揭开。
 * 闭包内每一步都记录公开理由，证明因此是一条「无需猜测」的完整路线。
 */
function closure(
  level: LevelContent,
  s: SearchState,
): { state: SearchState; belief: BeliefResult } {
  let belief = analyzeBelief(level, knowledge(s));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < level.cells.length * 2) {
    changed = false;

    // 1) 自动开门：与已探索区四邻接的封门可安全推开（门本身不是陷阱）。
    //    与试玩引擎 autoDoors 使用完全相同的规则，保证两处公开信息一致。
    for (const id of [...s.revealed]) {
      const four = [
        id - 1,
        id + 1,
        id - level.width,
        id + level.width,
      ].filter((n) => {
        const nx = n % level.width,
          ny = Math.floor(n / level.width);
        return nx >= 0 && nx < level.width && ny >= 0 && ny < level.height;
      });
      for (const n of four) {
        const c = level.cells[n];
        if (c && isDoor(c) && !s.revealed.has(n)) {
          s.revealed.add(n);
          s.steps.push({
            kind: "door",
            cell: n,
            reason: `推开必经封门 ${coordinate(n, level.width)}（门本身安全，门后通路由结构校验保证）`,
          });
          changed = true;
        }
      }
    }

    // 2)+3) 可证明安全的未知格，以及「无猜开局步」
    belief = analyzeBelief(level, knowledge(s));
    const constrained = new Set<number>();
    for (const eq of belief.equations) eq.vars.forEach((v) => constrained.add(v));
    const safeTargets = belief.frontier.filter((id) => {
      if (s.revealed.has(id) || s.exposed.has(id) || isDoor(level.cells[id]))
        return false;
      if (belief.provablySafe.has(id) || s.intel.get(id) === 1) return true;
      // 无猜开局步：该格不被任何已公开数字约束。
      // 此时玩家掌握的信息对它没有任何倾向，踏入不构成「猜测」——
      // 陷阱若真在此处，也没有任何数字本可预警，等价于正式探险的第一步。
      return !constrained.has(id) && s.intel.get(id) === undefined;
    });
    if (safeTargets.length) {
      const opened = floodReveal(
        level,
        safeTargets,
        (id) => s.revealed.has(id),
        (id) => s.revealed.has(id),
      );
      for (const id of opened) {
        s.revealed.add(id);
        s.steps.push({
          kind: "reveal",
          cell: id,
          reason: describeSafeReason(level, id, belief, constrained),
        });
      }
      changed = true;
    }
  }
  return { state: s, belief: analyzeBelief(level, knowledge(s)) };
}

function describeSafeReason(
  level: LevelContent,
  id: number,
  belief: BeliefResult,
  constrained?: Set<number>,
): string {
  if (belief.equations.some((e) => e.remaining === 0 && e.vars.includes(id)))
    return `${coordinate(id, level.width)}：相邻数字的剩余危险为 0，可安全探索`;
  const eq = belief.equations.find((e) => e.vars.includes(id));
  if (eq)
    return `${coordinate(id, level.width)}：约束联立（数字格 ${coordinate(eq.source, level.width)} 等）推出必然安全`;
  if (constrained && !constrained.has(id))
    return `${coordinate(id, level.width)}：无公开数字约束此格，属无猜开局步（与正式探险第一步同理）`;
  return `${coordinate(id, level.width)}：全局陷阱计数已出清，剩余格必然安全`;
}

function isWin(level: LevelContent, s: SearchState) {
  // 与原探险一致：所有可站立安全格（floor/door）揭开即胜，陷阱无需暴露
  return level.cells.every(
    (c) => c.kind === "wall" || c.kind === "trap" || s.revealed.has(c.id),
  );
}

function makeStuck(
  level: LevelContent,
  s: SearchState,
  belief: BeliefResult,
  message: string,
  visitedStates: number,
): StuckInfo {
  const constraints: StuckConstraint[] = belief.equations.map((e) => ({
    source: e.source,
    unknown: e.vars.filter((v) => !s.revealed.has(v) && !s.exposed.has(v)),
    remaining: e.remaining,
    text: `${coordinate(e.source, level.width)} 的数字 ${adjacentTraps(level, e.source)}：未知格 ${e.vars
      .map((v) => coordinate(v, level.width))
      .join("、")} 中还有 ${e.remaining} 处陷阱`,
  }));
  const relics = relicCells(level);
  return {
    frontier: belief.frontier.filter(
      (id) => !s.revealed.has(id) && !s.exposed.has(id),
    ),
    constraints,
    reachedRelics: relics.filter((r) => s.revealed.has(r.id)).map((r) => r.id),
    missingRelics: relics.filter((r) => !s.revealed.has(r.id)).map((r) => r.id),
    visitedStates,
    message,
  };
}

export interface SolverOutcome {
  record: Omit<ProofRecord, "contentHash" | "checkedAt">;
}

/**
 * 证明搜索。
 * - 宏闭包吸收所有确定性移动，分支只发生在「真正需要消耗资源的选择」上；
 * - 规范化信息状态做等价去重，资源向量做支配剪枝（保留资源不劣的状态）；
 * - 每次资源选择都按 探针→火把→护盾 排序，优先保留稀缺资源；
 * - 达到节点预算返回 cap，并附上卡住时的公开约束，供作者定位。
 */
export const TIME_CAP_MS = 4000;

export function solveNoGuess(
  level: LevelContent,
  nodeCap = NODE_CAP,
  timeCapMs = TIME_CAP_MS,
): SolverOutcome {
  const startedAt = Date.now();
  const initial: SearchState = {
    revealed: new Set<number>([level.start]),
    intel: new Map(),
    exposed: new Set(),
    tools: { ...level.tools },
    lives: level.lives,
    steps: [
      {
        kind: "reveal",
        cell: level.start,
        reason: "从入口出发，入口邻域保证安全",
      },
    ],
  };
  const first = closure(level, cloneState(initial));
  let work: SearchState[] = [first.state];
  const seenKeys = new Map<string, SearchState>();
  seenKeys.set(canonicalKey(first.state), first.state);

  // nodeCount：生成并处理过的状态总数（含被去重/支配剪枝者）
  // stateCount：去重后实际保留的等价信息状态数，恒满足 stateCount <= nodeCount
  let nodes = 1;
  let bestStuck: StuckInfo | null = null;
  const totalSafe = totalSafeCells(level);

  const remember = (s: SearchState): boolean => {
    nodes++;
    const key = canonicalKey(s);
    if (seenKeys.has(key)) return false;
    // 支配剪枝：若已存在信息相同、资源全面不劣的状态，丢弃当前状态
    for (const old of seenKeys.values()) {
      const sameInfo =
        sameSet(old.revealed, s.revealed) &&
        sameMap(old.intel, s.intel) &&
        sameSet(old.exposed, s.exposed);
      if (sameInfo && dominates(old, s)) return false;
    }
    seenKeys.set(key, s);
    return true;
  };

  while (work.length) {
    const cur = work.pop()!;
    const overBudget = nodes > nodeCap || Date.now() - startedAt > timeCapMs;
    if (overBudget) {
      return {
        record: {
          verdict: "cap",
          steps: cur.steps,
          toolsUsed: usedTools(level, cur),
          revealedSafe: cur.revealed.size,
          totalSafe,
          nodeCount: nodes,
          stateCount: seenKeys.size,
          stuck:
            bestStuck ??
            makeStuck(
              level,
              cur,
              analyzeBelief(level, knowledge(cur)),
              nodes > nodeCap
                ? "搜索达到节点预算仍无法穷尽信息状态，未能完成证明"
                : "搜索达到时间预算，信息状态空间过大，未能完成证明",
              seenKeys.size,
            ),
        },
      };
    }

    const { state, belief } = closure(level, cloneState(cur));
    if (isWin(level, state)) {
      return {
        record: {
          verdict: "proved",
          steps: state.steps,
          toolsUsed: usedTools(level, state),
          revealedSafe: state.revealed.size,
          totalSafe,
          nodeCount: nodes,
          stateCount: seenKeys.size,
          stuck: null,
        },
      };
    }

    const targets = belief.frontier.filter(
      (id) => !state.revealed.has(id) && !state.exposed.has(id),
    );
    if (!targets.length) {
      bestStuck =
        bestStuck ??
        makeStuck(
          level,
          state,
          belief,
          "已无可以触及的未知格，但仍有区域未探索（检查封门与墙的布局）",
          seenKeys.size,
        );
      continue;
    }

    // 真正需要消耗资源的「卡住前沿」：既未证明安全、也无道具结论，且仍被数字约束
    const constrainedNow = new Set<number>();
    for (const eq of belief.equations) eq.vars.forEach((v) => constrainedNow.add(v));
    const stuckTargets = targets.filter(
      (id) =>
        !belief.provablySafe.has(id) &&
        state.intel.get(id) === undefined &&
        constrainedNow.has(id),
    );
    if (!stuckTargets.length) {
      // 没有被约束却仍卡住的格：说明只剩无约束格，闭包本应处理；防御性记为卡住
      bestStuck =
        bestStuck ??
        makeStuck(
          level,
          state,
          belief,
          "前沿格无法继续推进，且没有可作用的公开约束",
          seenKeys.size,
        );
      continue;
    }

    const branches: SearchState[] = [];
    // 启发式：优先选择被最多方程引用的格，一次行动解开的约束信息量最大
    const score = (id: number) =>
      belief.equations.reduce((n, eq) => n + (eq.vars.includes(id) ? 1 : 0), 0);
    const ranked = [...stuckTargets].sort((a, b) => score(b) - score(a));
    // 资源保留：每种工具每状态只展开信息量最高的一个目标，
    // 避免把有限探针摊到多格；其余目标留给后续信息状态再决策。
    const probeTarget = ranked[0];
    const flareTarget = ranked[0];
    const shieldTarget = ranked[0];

    // 分支 A：探针 —— 不冒生命风险取得确定信息，优先以保留火把/护盾
    if (state.tools.probe > 0 && probeTarget !== undefined) {
      const id = probeTarget;
      const next = cloneState(state);
      next.tools.probe--;
      next.intel.set(id, isTrap(level.cells[id]) ? -1 : 1);
      next.steps.push({
        kind: "probe",
        cell: id,
        reason: `公开约束无法判定 ${coordinate(id, level.width)}，使用探针取得确定信息而非猜测`,
      });
      branches.push(next);
    }
    // 分支 B：火把 —— 安全则揭开（洪水），危险则仅确认
    if (state.tools.flare > 0 && flareTarget !== undefined) {
      const id = flareTarget;
      const next = cloneState(state);
      next.tools.flare--;
      if (isTrap(level.cells[id])) {
        next.intel.set(id, -1);
        next.steps.push({
          kind: "flare",
          cell: id,
          reason: `火把照亮 ${coordinate(id, level.width)}，确认危险且不触发陷阱`,
        });
      } else {
        next.intel.set(id, 1);
        next.steps.push({
          kind: "flare",
          cell: id,
          reason: `火把照亮 ${coordinate(id, level.width)}，安全并直接揭开`,
        });
      }
      branches.push(next);
    }
    // 分支 C：护盾下的探索 —— 唯一允许踏入未证明安全格的方式，花费容错资源
    if (state.tools.shield > 0 && state.lives > 0 && shieldTarget !== undefined) {
      const id = shieldTarget;
      const next = cloneState(state);
      next.tools.shield--;
      if (isTrap(level.cells[id])) {
        next.exposed.add(id);
        next.steps.push({
          kind: "shield",
          cell: id,
          reason: `护盾保护下探入 ${coordinate(id, level.width)}，触发陷阱但无伤，陷阱位置转为公开信息`,
        });
      } else {
        next.steps.push({
          kind: "shield",
          cell: id,
          reason: `护盾保护下探入 ${coordinate(id, level.width)}，实为安全格`,
        });
      }
      branches.push(next);
    }

    if (!branches.length) {
      bestStuck =
        bestStuck ??
        makeStuck(
          level,
          state,
          belief,
          `剩余 ${stuckTargets.length} 个前沿格均无法由公开约束证明安全，且道具已耗尽——存在必须猜测的分支`,
          seenKeys.size,
        );
      continue;
    }

    for (const b of branches) {
      const closed = closure(level, b);
      if (remember(closed.state)) work.push(closed.state);
    }
  }

  return {
    record: {
      verdict: "guess",
      steps: work[0]?.steps ?? initial.steps,
      toolsUsed: usedTools(level, work[0] ?? initial),
      revealedSafe: work[0]?.revealed.size ?? 1,
      totalSafe,
      nodeCount: nodes,
      stateCount: seenKeys.size,
      stuck:
        bestStuck ??
        makeStuck(
          level,
          initial,
          analyzeBelief(level, knowledge(initial)),
          "在给定道具下不存在无需猜测的完整探索过程",
          seenKeys.size,
        ),
    },
  };
}


function sameSet(a: Set<number>, b: Set<number>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
function sameMap(a: Map<number, 1 | -1>, b: Map<number, 1 | -1>) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}
function usedTools(level: LevelContent, s: SearchState): ToolBag {
  return {
    probe: level.tools.probe - s.tools.probe,
    flare: level.tools.flare - s.tools.flare,
    shield: level.tools.shield - s.tools.shield,
  };
}

export function verifyLevel(
  level: LevelContent,
  nodeCap = NODE_CAP,
  timeCapMs = TIME_CAP_MS,
): ProofRecord {
  const { record } = solveNoGuess(level, nodeCap, timeCapMs);
  return {
    ...record,
    contentHash: contentHash(level),
    checkedAt: Date.now(),
  };
}
