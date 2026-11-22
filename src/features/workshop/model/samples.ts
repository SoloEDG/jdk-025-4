import type { LevelContent } from "../../../shared/level";
import { blankLevel } from "./editor";

/** 内置示例：保证结构合法且可在给定道具下无需猜测完成 */
export function sampleLevel(): LevelContent {
  const level = blankLevel(9, 9);
  const wall = (x: number, y: number) => y * 9 + x;
  type EditOp =
    | LevelContent["cells"][number]["kind"]
    | `relic:${string}`
    | "start";
  const edits: [number, EditOp][] = [
    // 不规则外墙：挖出缺口与回廊
    [wall(0, 2), "wall"], [wall(0, 3), "wall"], [wall(8, 1), "wall"],
    [wall(8, 5), "wall"], [wall(8, 6), "wall"], [wall(3, 0), "wall"],
    [wall(4, 0), "wall"], [wall(5, 8), "wall"], [wall(6, 8), "wall"],
    // 内部分隔墙，留出一扇必经封门
    [wall(4, 2), "wall"], [wall(4, 3), "door"], [wall(4, 4), "wall"],
    [wall(2, 6), "wall"], [wall(3, 6), "wall"],
    // 陷阱：数字可约束的布置
    [wall(2, 2), "trap"], [wall(6, 3), "trap"], [wall(3, 4), "trap"],
    [wall(6, 6), "trap"], [wall(1, 7), "trap"],
    // 文物：门后深处两件，外区一件
    [wall(6, 1), "relic:sun"], [wall(7, 4), "relic:vessel"],
    [wall(2, 7), "relic:tablet"],
    [wall(1, 4), "start"],
  ];
  let cells = level.cells.map((c) => ({ ...c }));
  let start = level.start;
  for (const [id, op] of edits) {
    if (op === "start") {
      start = id;
      continue;
    }
    if (op.startsWith("relic:")) {
      cells[id].kind = "floor";
      cells[id].relic = op.slice(6) as LevelContent["cells"][number]["relic"];
    } else {
      cells[id].kind = op as LevelContent["cells"][number]["kind"];
      if (op !== "floor") cells[id].relic = null;
    }
  }
  return {
    ...level,
    name: "示例 · 苔石封门",
    author: "遗迹学会",
    cells,
    start,
    tools: { probe: 2, flare: 1, shield: 1 },
    lives: 3,
  };
}
