import type { LevelContent } from "../../../shared/level";
import { neighbors } from "../../../shared/geometry";
import { adjacentTraps, isDoor } from "./geometry";

/**
 * 公开信息状态：证明搜索与试玩共用同一套观测定义，
 * 保证「验证用的公开约束」就是「玩家实际能看到的信息」。
 * 不包含任何暗格答案。
 */
export interface PublicKnowledge {
  /** 已揭开的安全格（含已打开的封门） */
  revealed: ReadonlySet<number>;
  /** 探针/火把得到的直接结论：1 安全，-1 危险 */
  intel: ReadonlyMap<number, 1 | -1>;
  /** 已暴露的陷阱（护盾抵挡或失误揭开） */
  exposedTraps: ReadonlySet<number>;
}

export interface Equation {
  source: number;
  vars: number[];
  remaining: number;
}

export interface BeliefResult {
  /** 在所有一致配置中都安全的未知格 */
  provablySafe: Set<number>;
  /** 在所有一致配置中都危险的未知格 */
  provablyDanger: Set<number>;
  /** 当前数字产生的公开方程 */
  equations: Equation[];
  /** 与已揭开区域相邻、可作为行动目标的未知格 */
  frontier: number[];
  /** 枚举的一致配置数（达到上限则结果保守处理） */
  models: number;
  capped: boolean;
  /** 公开信息自相矛盾（合法探索中不应出现） */
  inconsistent: boolean;
}

const MODEL_CAP = 240;

const holdsUnknown = (level: LevelContent, k: PublicKnowledge, id: number) => {
  const c = level.cells[id];
  return (
    !!c &&
    c.kind !== "wall" &&
    !k.revealed.has(id) &&
    !k.exposedTraps.has(id)
  );
};

/**
 * 仅枚举「出现在数字方程里的未知格」的 0/1 赋值；
 * 深处未被数字约束的格子通过全局陷阱容量不等式检验，避免组合爆炸。
 * 变量域一律 {0,1}——不借助真实地图种类，结论只依赖公开观测。
 */
export function analyzeBelief(
  level: LevelContent,
  k: PublicKnowledge,
): BeliefResult {
  const totalMines = level.cells.filter((c) => c.kind === "trap").length;

  // 局部数字方程
  const equations: Equation[] = [];
  const varSet = new Set<number>();
  let inconsistent = false;
  for (const id of k.revealed) {
    const around = neighbors(id, level.width, level.height);
    const knownDanger = around.filter(
      (n) => k.exposedTraps.has(n) || k.intel.get(n) === -1,
    ).length;
    const vars = around.filter(
      (n) => holdsUnknown(level, k, n) && k.intel.get(n) === undefined,
    );
    const remaining = adjacentTraps(level, id) - knownDanger;
    if (remaining < 0 || remaining > vars.length) inconsistent = true;
    if (vars.length) {
      const unique = [...new Set(vars)];
      equations.push({ source: id, vars: unique, remaining });
      unique.forEach((v) => varSet.add(v));
    }
  }

  // 全局方程：所有未定性未知格上的陷阱数 = 剩余陷阱总数
  const allUnknown = level.cells
    .map((c) => c.id)
    .filter((id) => holdsUnknown(level, k, id) && k.intel.get(id) === undefined);
  const knownMines =
    k.exposedTraps.size +
    [...k.intel.values()].filter((v) => v === -1).length;
  const globalRemaining = totalMines - knownMines;
  const unconstrained = allUnknown.filter((id) => !varSet.has(id));

  const vars = [...varSet];
  // 约束度高的变量优先赋值，增量剪枝更早生效
  const degree = new Map<number, number>();
  for (const eq of equations)
    for (const v of eq.vars) degree.set(v, (degree.get(v) ?? 0) + 1);
  vars.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));

  const min = new Map<number, number>();
  const max = new Map<number, number>();
  let models = 0;
  let visits = 0;
  let capped = false;
  const VISIT_CAP = 6000;
  const assignment = new Map<number, number>();

  // 增量检查：当前部分赋值下，每条方程仍可被满足
  const feasible = (): boolean => {
    for (const eq of equations) {
      let assigned = 0,
        unassigned = 0;
      for (const v of eq.vars) {
        const a = assignment.get(v);
        if (a === undefined) unassigned++;
        else assigned += a;
      }
      if (assigned > eq.remaining) return false;
      if (assigned + unassigned < eq.remaining) return false;
    }
    return true;
  };

  const dfs = (idx: number) => {
    if (capped) return;
    if (++visits > VISIT_CAP) {
      capped = true;
      return;
    }
    if (idx === vars.length) {
      const used = vars.reduce((s, v) => s + (assignment.get(v) ?? 0), 0);
      const rest = globalRemaining - used;
      if (rest < 0 || rest > unconstrained.length) return;
      models++;
      for (const v of vars) {
        const val = assignment.get(v)!;
        min.set(v, Math.min(min.get(v) ?? 1, val));
        max.set(v, Math.max(max.get(v) ?? 0, val));
      }
      if (models >= MODEL_CAP) capped = true;
      return;
    }
    const v = vars[idx];
    assignment.set(v, 0);
    if (feasible()) dfs(idx + 1);
    if (!capped) {
      assignment.set(v, 1);
      if (feasible()) dfs(idx + 1);
    }
    assignment.delete(v);
  };
  dfs(0);

  const provablySafe = new Set<number>();
  const provablyDanger = new Set<number>();
  if (!capped && !inconsistent && models > 0) {
    for (const v of vars) {
      if (max.get(v) === 0) provablySafe.add(v);
      else if (min.get(v) === 1) provablyDanger.add(v);
    }
    if (globalRemaining === 0) allUnknown.forEach((id) => provablySafe.add(id));
    if (globalRemaining === allUnknown.length && allUnknown.length)
      allUnknown.forEach((id) => provablyDanger.add(id));
  }
  // 道具直接确认
  for (const [id, val] of k.intel) {
    if (val === 1) provablySafe.add(id);
    else provablyDanger.add(id);
  }

  const frontierSet = new Set<number>();
  for (const id of k.revealed)
    for (const n of neighbors(id, level.width, level.height)) {
      if (holdsUnknown(level, k, n) && !isDoor(level.cells[n]))
        frontierSet.add(n);
      if (holdsUnknown(level, k, n) && isDoor(level.cells[n]))
        frontierSet.add(n);
    }
  return {
    provablySafe,
    provablyDanger,
    equations,
    frontier: [...frontierSet],
    models,
    capped,
    inconsistent,
  };
}
