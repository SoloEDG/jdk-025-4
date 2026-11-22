import { useMemo, useRef, useState } from "react";
import {
  TriangleAlert,
  Gem,
  Flag,
  Lock,
  DoorOpen,
} from "lucide-react";
import type { LevelContent } from "../../../shared/level";
import type { PaintTool } from "../model/editor";
import { authorNumbers } from "../model/editor";
import { connectedRegions } from "../model/regions";
import { coordinate } from "../model/geometry";
import type { LevelIssue } from "../model/validate";

const REGION_COLORS = [
  "#3a5a4c", "#5a4632", "#3d4d63", "#5f3f46", "#4a5530",
  "#5c4a2a", "#355255", "#55364f", "#3f4a3a", "#604030",
];

export function EditorBoard({
  level,
  tool,
  issues,
  onPaint,
}: {
  level: LevelContent;
  tool: PaintTool;
  issues: LevelIssue[];
  onPaint: (tool: PaintTool, id: number) => void;
}) {
  const numbers = useMemo(() => authorNumbers(level), [level]);
  const regions = useMemo(() => connectedRegions(level), [level]);
  const [drag, setDrag] = useState(false);
  const issueCells = useMemo(
    () => new Set(issues.filter((i) => i.cell !== undefined).map((i) => i.cell!)),
    [issues],
  );
  const lastCell = useRef<number | null>(null);

  const paint = (id: number) => {
    if (lastCell.current === id) return;
    lastCell.current = id;
    onPaint(tool, id);
  };

  return (
    <section className="board-panel workshop-board-panel">
      <div className="board-heading">
        <div>
          <span className="eyebrow">WORKSHOP / AUTHOR VIEW</span>
          <h2>
            创作视图
            <span>可见全部答案 · {regions.count} 个连通区域</span>
          </h2>
        </div>
      </div>
      <div
        className="map-area"
        onPointerUp={() => {
          setDrag(false);
          lastCell.current = null;
        }}
        onPointerLeave={() => {
          setDrag(false);
          lastCell.current = null;
        }}
      >
        <div
          role="grid"
          aria-label="关卡创作网格"
          aria-rowcount={level.height}
          aria-colcount={level.width}
          className="board-grid workshop-grid"
          style={{ gridTemplateColumns: `repeat(${level.width},1fr)` }}
          onPointerDown={() => setDrag(true)}
        >
          {level.cells.map((c) => {
            const num = numbers[c.id];
            const regionTag = regions.label[c.id];
            const regionColor =
              regionTag >= 0 ? REGION_COLORS[regionTag % REGION_COLORS.length] : undefined;
            const isStart = level.start === c.id;
            return (
              <button
                role="gridcell"
                key={c.id}
                aria-label={`${coordinate(c.id, level.width)} ${c.kind}${c.relic ? " 文物" : ""}${isStart ? " 入口" : ""}`}
                className={[
                  "tile",
                  "workshop-tile",
                  c.kind === "wall" ? "ws-wall" : "",
                  c.kind === "trap" ? "ws-trap" : "",
                  c.kind === "door" ? "ws-door" : "",
                  isStart ? "ws-start" : "",
                  issueCells.has(c.id) ? "ws-issue" : "",
                ].join(" ")}
                style={regionColor && c.kind !== "wall" ? { background: regionColor } : undefined}
                onPointerDown={() => paint(c.id)}
                onPointerEnter={() => drag && paint(c.id)}
              >
                {c.kind === "wall" ? (
                  <Lock size={14} className="ws-lock" />
                ) : c.kind === "trap" ? (
                  <TriangleAlert size={15} />
                ) : c.kind === "door" ? (
                  <DoorOpen size={15} />
                ) : isStart ? (
                  <Flag size={15} className="ws-flag" />
                ) : c.relic ? (
                  <Gem size={15} className="ws-gem" />
                ) : num > 0 ? (
                  <span className={"number-" + num}>{num}</span>
                ) : (
                  <span className="stone-dot">·</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="board-legend ws-legend">
        <span><i className="ws-wall swatch" />边界墙</span>
        <span><TriangleAlert size={12} />陷阱</span>
        <span><DoorOpen size={12} />封门</span>
        <span><Gem size={12} />文物</span>
        <span><Flag size={12} />入口</span>
        <small>按住拖拽可连续绘制 · 数字随陷阱实时重算</small>
      </div>
    </section>
  );
}
