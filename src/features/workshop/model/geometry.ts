import type { LevelContent, CellSpec, ToolBag } from "../../../shared/level";
import { neighbors } from "../../../shared/geometry";

export function cellAt(level: LevelContent, id: number): CellSpec | undefined {
  return level.cells[id];
}

export function isWall(c: CellSpec) {
  return c.kind === "wall";
}
export function isTrap(c: CellSpec) {
  return c.kind === "trap";
}
export function isDoor(c: CellSpec) {
  return c.kind === "door";
}
/** 玩家可站立的安全格（门打开前后都算可达区域的一部分） */
export function isFloorLike(c: CellSpec) {
  return c.kind === "floor" || c.kind === "door";
}

/** 八邻域内的陷阱数，即石板向玩家公开的数字 */
export function adjacentTraps(level: LevelContent, id: number): number {
  return neighbors(id, level.width, level.height).filter(
    (n) => level.cells[n]?.kind === "trap",
  ).length;
}

export function countBy(level: LevelContent, kind: CellSpec["kind"]) {
  return level.cells.filter((c) => c.kind === kind).length;
}

export function relicCells(level: LevelContent) {
  return level.cells.filter((c) => c.relic);
}

/**
 * 结构性连通：忽略门的开闭状态，四连通（玩家移动）。
 * 用于检查入口、门、文物是否在同一可通行区域。
 */
export function reachableStructural(
  level: LevelContent,
  from: number,
): Set<number> {
  const seen = new Set<number>([from]);
  const queue = [from];
  // 只有墙阻断连通；陷阱是「可越过的危险格」（护盾/火把），不分割区域
  const walkable = (id: number) => {
    const c = level.cells[id];
    return c && c.kind !== "wall";
  };
  while (queue.length) {
    const id = queue.shift()!;
    const x = id % level.width,
      y = Math.floor(id / level.width);
    const four: number[] = [];
    if (x > 0) four.push(id - 1);
    if (x < level.width - 1) four.push(id + 1);
    if (y > 0) four.push(id - level.width);
    if (y < level.height - 1) four.push(id + level.width);
    for (const n of four)
      if (!seen.has(n) && walkable(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen;
}

/**
 * 探险中的揭开洪水：从安全格出发，数字为 0 自动外扩；
 * 墙、陷阱、未打开的门都会阻断。
 */
export function floodReveal(
  level: LevelContent,
  seeds: number[],
  isRevealed: (id: number) => boolean,
  isOpenDoor: (id: number) => boolean,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const queue = [...seeds];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = level.cells[id];
    if (!c || c.kind === "wall" || c.kind === "trap") continue;
    if (c.kind === "door" && !isOpenDoor(id)) continue;
    if (isRevealed(id)) continue;
    out.push(id);
    if (adjacentTraps(level, id) === 0) {
      for (const n of neighbors(id, level.width, level.height))
        if (!seen.has(n)) queue.push(n);
    }
  }
  return out;
}

export function totalSafeCells(level: LevelContent) {
  return level.cells.filter((c) => c.kind === "floor" || c.kind === "door")
    .length;
}

export function toolsUsedTotal(t: ToolBag) {
  return t.probe + t.flare + t.shield;
}

/** FNV-1a 32 位内容哈希：只覆盖几何、陷阱、文物、入口与补给，不包含名称与时间戳 */
export function contentHash(level: LevelContent): string {
  const parts = [
    level.width,
    level.height,
    level.start,
    level.lives,
    level.tools.probe,
    level.tools.flare,
    level.tools.shield,
    ...level.cells.map((c) => `${c.id}:${c.kind}:${c.relic ?? "-"}`),
  ];
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "h" + (h >>> 0).toString(16).padStart(8, "0");
}

export function coordinate(id: number, width: number) {
  return `${String.fromCharCode(65 + (id % width))}${Math.floor(id / width) + 1}`;
}
