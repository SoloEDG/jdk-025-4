import type { LevelContent } from "../../../shared/level";
import {
  adjacentTraps,
  isDoor,
  isFloorLike,
  isTrap,
  reachableStructural,
  relicCells,
} from "./geometry";

export type IssueLevel = "error" | "warning";

export interface LevelIssue {
  level: IssueLevel;
  code: string;
  message: string;
  cell?: number;
}

export const MIN_W = 4;
export const MAX_W = 16;
export const MIN_H = 4;
export const MAX_H = 14;

/**
 * 仅依赖关卡内容的结构校验。试玩、导入、发布都必须先通过它。
 * 与证明无关，因此命名为 structural —— 证明在 solver 中单独完成。
 */
export function validateStructure(level: LevelContent): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const push = (
    level_: IssueLevel,
    code: string,
    message: string,
    cell?: number,
  ) => issues.push({ level: level_, code, message, cell });

  if (
    !Number.isInteger(level.width) ||
    !Number.isInteger(level.height) ||
    level.width < MIN_W ||
    level.width > MAX_W ||
    level.height < MIN_H ||
    level.height > MAX_H
  )
    push("error", "size", `地图尺寸需在 ${MIN_W}–${MAX_W} × ${MIN_H}–${MAX_H} 之间`);
  if (level.cells.length !== level.width * level.height)
    push("error", "cells", "石板数量与地图尺寸不一致");
  if (!Number.isInteger(level.lives) || level.lives < 1 || level.lives > 5)
    push("error", "lives", "生命数需在 1–5 之间");
  for (const k of ["probe", "flare", "shield"] as const)
    if (!Number.isInteger(level.tools[k]) || level.tools[k] < 0 || level.tools[k] > 9)
      push("error", "tools", `道具 ${k} 数量需在 0–9 之间`);
  if (issues.some((i) => i.code === "size" || i.code === "cells")) return issues;

  const start = level.cells[level.start];
  if (!start) push("error", "start", "缺少入口");
  else if (start.kind !== "floor")
    push("error", "start", "入口必须设在普通石板上", level.start);
  else if (isTrap(start) || adjacentTraps(level, level.start) > 0)
    push("error", "start", "入口及其邻格不能是陷阱（保证第一步安全）", level.start);

  const relics = relicCells(level);
  if (!relics.length) push("error", "relic", "至少布置一件目标文物");
  for (const c of relics)
    if (c.kind !== "floor")
      push("error", "relic", "文物只能放在普通石板上", c.id);

  const doors = level.cells.filter(isDoor);
  if (doors.length > 6) push("warning", "doors", "封门超过 6 扇，验证搜索可能较慢");

  // 结构连通：入口能否到达每一扇门、每一件文物（门视为可通行）
  const reach = start ? reachableStructural(level, level.start) : new Set<number>();
  for (const c of level.cells) {
    if (!isFloorLike(c)) continue;
    if (!reach.has(c.id))
      push(
        "error",
        "isolated",
        c.kind === "door" ? "封门无法从入口到达" : "石板与入口不连通（不规则边界围出了死角）",
        c.id,
      );
  }
  for (const c of relics)
    if (!reach.has(c.id))
      push("error", "relic-reach", "文物所在区域无法从入口到达", c.id);

  // 必经封门：把门视为阻断后，至少有一件文物无法到达，门才有存在意义
  for (const d of doors) {
    const blocked: LevelContent = {
      ...level,
      cells: level.cells.map((c) =>
        c.id === d.id ? { ...c, kind: "wall" } : c,
      ),
    };
    const reachWithout = reachableStructural(blocked, level.start);
    if (relics.every((r) => reachWithout.has(r.id)))
      push(
        "warning",
        "door-not-required",
        "这扇封门并非通往文物的必经之路，可考虑移除或改道",
        d.id,
      );
  }

  // 被墙完全包围的陷阱不产生任何公开数字，验证无法证明其存在
  for (const c of level.cells)
    if (isTrap(c)) {
      const around = neighbors_(level, c.id);
      if (around.length && around.every((n) => level.cells[n].kind === "wall"))
        push(
          "warning",
          "hidden-trap",
          "陷阱被墙完全包围，任何公开数字都无法约束它，无需猜测的证明可能失败",
          c.id,
        );
    }

  const floorCount = level.cells.filter((c) => c.kind === "floor").length;
  if (floorCount < 4) push("error", "too-small", "可探索石板过少，无法构成遗迹");
  return issues;
}

function neighbors_(level: LevelContent, id: number) {
  const x = id % level.width,
    y = Math.floor(id / level.width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx,
        ny = y + dy;
      if (nx >= 0 && nx < level.width && ny >= 0 && ny < level.height)
        out.push(ny * level.width + nx);
    }
  return out;
}

export function hasErrors(issues: LevelIssue[]) {
  return issues.some((i) => i.level === "error");
}
