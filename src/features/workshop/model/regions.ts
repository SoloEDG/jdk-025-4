import type { LevelContent } from "../../../shared/level";

/**
 * 四连通区域标注：墙与陷阱阻断；门与普通石板视为可通行。
 * 陷阱位置或边界一变，区域编号立即重算。
 */
export function connectedRegions(
  level: LevelContent,
): { label: Int16Array; count: number; sizes: number[] } {
  const label = new Int16Array(level.cells.length).fill(-1);
  const sizes: number[] = [];
  let count = 0;
  // 连通区域只按墙划分；陷阱是危险但可越过的格，不计入安全区域标签
  const walkable = (id: number) => level.cells[id].kind !== "wall";
  for (let i = 0; i < level.cells.length; i++) {
    if (label[i] !== -1 || !walkable(i)) continue;
    const tag = count++;
    let size = 0;
    const queue = [i];
    label[i] = tag;
    while (queue.length) {
      const id = queue.shift()!;
      size++;
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
      for (const n of four)
        if (label[n] === -1 && walkable(n)) {
          label[n] = tag;
          queue.push(n);
        }
    }
    sizes.push(size);
  }
  return { label, count, sizes };
}
