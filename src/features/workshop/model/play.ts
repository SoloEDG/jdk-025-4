import type {
  LevelContent,
  PlayResult,
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
} from "./geometry";
import { analyzeBelief, type PublicKnowledge } from "./belief";

export interface PlayEvent {
  kind:
    | "start"
    | "reveal"
    | "hit"
    | "shield-block"
    | "probe"
    | "flare"
    | "shield"
    | "door"
    | "win"
    | "lose";
  cell: number | null;
  message: string;
}

export interface PlayState {
  level: LevelContent;
  /** 关卡内容版本；试玩开始时锁定，之后作者编辑不影响本局 */
  hash: string;
  revealed: Set<number>;
  intel: Map<number, 1 | -1>;
  exposed: Set<number>;
  tools: ToolBag;
  shieldActive: boolean;
  lives: number;
  used: number;
  mistakes: number;
  elapsed: number;
  status: "active" | "won" | "lost";
  log: PlayEvent[];
  startedAt: number;
}

export function startPlay(level: LevelContent, now: number): PlayState {
  const state: PlayState = {
    level,
    hash: contentHash(level),
    revealed: new Set<number>([level.start]),
    intel: new Map(),
    exposed: new Set(),
    tools: { ...level.tools },
    shieldActive: false,
    lives: level.lives,
    used: 0,
    mistakes: 0,
    elapsed: 0,
    status: "active",
    log: [
      {
        kind: "start",
        cell: level.start,
        message: `探险开始，入口 ${coordinate(level.start, level.width)} 已安全揭开`,
      },
    ],
    startedAt: now,
  };
  // 入口的 0 数字洪水
  const opened = floodReveal(
    level,
    [level.start],
    (id) => state.revealed.has(id),
    () => false,
  );
  // 自动推开与已探索区相邻的门
  autoDoors(level, state);
  for (const id of opened) state.revealed.add(id);
  autoDoors(level, state);
  checkWin(level, state);
  return state;
}

function autoDoors(level: LevelContent, s: PlayState) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...s.revealed]) {
      for (const n of neighbors4(level, id)) {
        if (isDoor(level.cells[n]) && !s.revealed.has(n)) {
          s.revealed.add(n);
          s.log.push({
            kind: "door",
            cell: n,
            message: `推开必经封门 ${coordinate(n, level.width)}`,
          });
          changed = true;
        }
      }
    }
  }
}

function neighbors4(level: LevelContent, id: number) {
  const x = id % level.width,
    y = Math.floor(id / level.width);
  const out: number[] = [];
  if (x > 0) out.push(id - 1);
  if (x < level.width - 1) out.push(id + 1);
  if (y > 0) out.push(id - level.width);
  if (y < level.height - 1) out.push(id + level.width);
  return out;
}

function knowledge(s: PlayState): PublicKnowledge {
  return { revealed: s.revealed, intel: s.intel, exposedTraps: s.exposed };
}

export function publicAnalysis(s: PlayState) {
  return analyzeBelief(s.level, knowledge(s));
}

/** 玩家视角的格信息：暗格绝不泄漏种类与文物 */
export interface PlayerCellView {
  id: number;
  state: "wall" | "unknown" | "intel-safe" | "intel-danger" | "exposed-trap" | "open";
  adjacent: number | null;
  relic: LevelContent["cells"][number]["relic"];
  isDoor: boolean;
  provablySafe: boolean;
  provablyDanger: boolean;
}

export function playerView(s: PlayState): PlayerCellView[] {
  const belief = analyzeBelief(s.level, knowledge(s));
  return s.level.cells.map((c) => {
    if (c.kind === "wall")
      return {
        id: c.id,
        state: "wall",
        adjacent: null,
        relic: null,
        isDoor: false,
        provablySafe: false,
        provablyDanger: false,
      };
    if (s.revealed.has(c.id))
      return {
        id: c.id,
        state: "open",
        adjacent: adjacentTraps(s.level, c.id),
        relic: c.relic,
        isDoor: isDoor(c),
        provablySafe: false,
        provablyDanger: false,
      };
    if (s.exposed.has(c.id))
      return {
        id: c.id,
        state: "exposed-trap",
        adjacent: null,
        relic: null,
        isDoor: false,
        provablySafe: false,
        provablyDanger: false,
      };
    const intel = s.intel.get(c.id);
    return {
      id: c.id,
      state:
        intel === 1
          ? "intel-safe"
          : intel === -1
            ? "intel-danger"
            : "unknown",
      adjacent: null,
      relic: null,
      isDoor: isDoor(c),
      provablySafe: belief.provablySafe.has(c.id),
      provablyDanger: belief.provablyDanger.has(c.id),
    };
  });
}

function checkWin(level: LevelContent, s: PlayState) {
  // 所有可站立安全格揭开即胜；陷阱保持暗格或已暴露均可
  const allDone = level.cells.every(
    (c) => c.kind === "wall" || c.kind === "trap" || s.revealed.has(c.id),
  );
  if (allDone && s.status === "active") {
    s.status = "won";
    s.log.push({ kind: "win", cell: null, message: "遗迹已完整探索，全部目标达成" });
  }
}

/** 普通探索：只允许揭开未知格；公开推理高亮仅作提示，不代替玩家决定 */
export function reveal(s: PlayState, id: number): PlayState {
  if (s.status !== "active") return s;
  const c = s.level.cells[id];
  if (!c || c.kind === "wall" || s.revealed.has(id) || s.exposed.has(id))
    return s;
  const next = clone(s);
  if (isTrap(c)) {
    next.mistakes++;
    if (next.shieldActive) {
      next.shieldActive = false;
      next.exposed.add(id);
      next.log.push({
        kind: "shield-block",
        cell: id,
        message: `守护符石挡住了 ${coordinate(id, next.level.width)} 的陷阱，陷阱位置已公开`,
      });
    } else {
      next.lives--;
      next.exposed.add(id);
      next.log.push({
        kind: "hit",
        cell: id,
        message: `触发 ${coordinate(id, next.level.width)} 的陷阱，损失 1 点生命`,
      });
      if (next.lives <= 0) {
        next.status = "lost";
        next.log.push({ kind: "lose", cell: id, message: "生命耗尽，探险失败" });
        return next;
      }
    }
  } else {
    const opened = floodReveal(
      next.level,
      [id],
      (x) => next.revealed.has(x),
      (x) => next.revealed.has(x),
    );
    for (const x of opened) next.revealed.add(x);
    autoDoors(next.level, next);
    next.log.push({
      kind: "reveal",
      cell: id,
      message: `探索 ${coordinate(id, next.level.width)}，揭开 ${opened.length} 块石板`,
    });
  }
  checkWin(next.level, next);
  return next;
}

export function useProbe(s: PlayState, id: number): PlayState {
  if (s.status !== "active" || s.tools.probe <= 0) return s;
  const c = s.level.cells[id];
  if (!c || c.kind === "wall" || s.revealed.has(id) || s.exposed.has(id) || s.intel.has(id))
    return s;
  const next = clone(s);
  next.tools.probe--;
  next.used++;
  next.intel.set(id, isTrap(c) ? -1 : 1);
  next.log.push({
    kind: "probe",
    cell: id,
    message: `探针确认 ${coordinate(id, next.level.width)}：${isTrap(c) ? "危险" : "安全"}`,
  });
  return next;
}

export function useFlare(s: PlayState, id: number): PlayState {
  if (s.status !== "active" || s.tools.flare <= 0) return s;
  const c = s.level.cells[id];
  if (!c || c.kind === "wall" || s.revealed.has(id) || s.exposed.has(id) || s.intel.get(id) === -1)
    return s;
  const next = clone(s);
  next.tools.flare--;
  next.used++;
  if (isTrap(c)) {
    next.intel.set(id, -1);
    next.log.push({
      kind: "flare",
      cell: id,
      message: `火把照亮 ${coordinate(id, next.level.width)}：危险，未触发陷阱`,
    });
  } else {
    next.intel.set(id, 1);
    const opened = floodReveal(
      next.level,
      [id],
      (x) => next.revealed.has(x),
      (x) => next.revealed.has(x),
    );
    for (const x of opened) next.revealed.add(x);
    autoDoors(next.level, next);
    next.log.push({
      kind: "flare",
      cell: id,
      message: `火把照亮 ${coordinate(id, next.level.width)}：安全并揭开`,
    });
    checkWin(next.level, next);
  }
  return next;
}

export function useShield(s: PlayState): PlayState {
  if (s.status !== "active" || s.tools.shield <= 0 || s.shieldActive) return s;
  const next = clone(s);
  next.tools.shield--;
  next.used++;
  next.shieldActive = true;
  next.log.push({ kind: "shield", cell: null, message: "守护符石已激活，将抵挡下一次陷阱" });
  return next;
}

export function tick(s: PlayState): PlayState {
  if (s.status !== "active") return s;
  return { ...s, elapsed: s.elapsed + 1 };
}

export function relicsFound(s: PlayState) {
  return relicCells(s.level)
    .filter((c) => s.revealed.has(c.id))
    .map((c) => c.relic!);
}

export function toResult(s: PlayState): PlayResult {
  const outcome: PlayResult["outcome"] = s.status === "active" ? "lost" : s.status;
  return {
    id: `${s.hash}-${s.startedAt}`,
    levelName: s.level.name,
    contentHash: s.hash,
    outcome,
    relicsFound: relicsFound(s),
    mistakes: s.mistakes,
    used: s.used,
    seconds: s.elapsed,
    at: Date.now(),
    stale: false,
  };
}

function clone(s: PlayState): PlayState {
  return {
    ...s,
    revealed: new Set(s.revealed),
    intel: new Map(s.intel),
    exposed: new Set(s.exposed),
    tools: { ...s.tools },
    log: s.log.slice(-120),
  };
}
