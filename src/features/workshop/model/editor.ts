import type {
  CellKind,
  CellSpec,
  LevelContent,
  ToolBag,
} from "../../../shared/level";
import { emptyToolBag } from "../../../shared/level";
import { adjacentTraps } from "./geometry";

export function blankLevel(width = 9, height = 9): LevelContent {
  const cells: CellSpec[] = Array.from({ length: width * height }, (_, id) => ({
    id,
    kind: "floor",
    relic: null,
  }));
  const start = Math.floor(height / 2) * width + 1;
  return {
    format: 1,
    width,
    height,
    name: "未命名遗迹",
    author: "匿名勘者",
    cells,
    start,
    tools: { probe: 2, flare: 1, shield: 1 },
    lives: 3,
  };
}

export type PaintTool =
  | "wall"
  | "trap"
  | "door"
  | "erase"
  | "relic-sun"
  | "relic-vessel"
  | "relic-tablet"
  | "start";

export function applyPaint(
  level: LevelContent,
  tool: PaintTool,
  id: number,
): LevelContent {
  const cells = level.cells.map((c) => ({ ...c }));
  const c = cells[id];
  let start = level.start;
  const setKind = (kind: CellKind) => {
    c.kind = kind;
    if (kind !== "floor") c.relic = null;
  };
  switch (tool) {
    case "wall":
    case "trap":
    case "door":
      // 当前入口格不允许覆盖，作者需先把入口迁移到其他普通石板
      if (id === level.start) return level;
      setKind(tool);
      break;
    case "erase":
      c.kind = "floor";
      c.relic = null;
      break;
    case "start":
      if (c.kind === "floor") {
        start = id;
        c.relic = null;
      }
      break;
    default: {
      const relic = tool.replace("relic-", "") as CellSpec["relic"];
      if (c.kind === "floor" && id !== level.start) c.relic = relic;
    }
  }
  return { ...level, cells, start };
}

export function resizeLevel(
  level: LevelContent,
  width: number,
  height: number,
): LevelContent {
  const cells: CellSpec[] = Array.from({ length: width * height }, (_, id) => {
    const old = level.cells[id];
    return old ? { ...old, id } : { id, kind: "wall" as CellKind, relic: null };
  });
  const start = level.start < cells.length ? level.start : -1;
  return { ...level, width, height, cells, start };
}

export function setTools(level: LevelContent, tools: ToolBag): LevelContent {
  return { ...level, tools };
}

/** 作者视图使用的实时数字（陷阱一变动即重算，相邻数字自动更新） */
export function authorNumbers(level: LevelContent): number[] {
  return level.cells.map((c) =>
    c.kind === "wall" || c.kind === "trap"
      ? -1
      : adjacentTraps(level, c.id),
  );
}

export function countRelics(level: LevelContent) {
  return level.cells.filter((c) => c.relic).length;
}

export function defaultTools(): ToolBag {
  return emptyToolBag();
}
