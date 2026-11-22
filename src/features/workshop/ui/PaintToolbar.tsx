import {
  BrickWall,
  TriangleAlert,
  DoorOpen,
  Eraser,
  Flag,
  Gem,
  Heart,
  ScanLine,
  Flame,
  ShieldCheck,
} from "lucide-react";
import type { LevelContent, ToolBag } from "../../../shared/level";
import type { PaintTool } from "../model/editor";
import { countRelics } from "../model/editor";
import { countBy as countByHelper } from "../model/geometry";
import { MIN_W, MIN_H, MAX_W, MAX_H } from "../model/validate";

const TOOLS: { id: PaintTool; name: string; icon: typeof BrickWall }[] = [
  { id: "wall", name: "边界墙", icon: BrickWall },
  { id: "trap", name: "陷阱", icon: TriangleAlert },
  { id: "door", name: "必经封门", icon: DoorOpen },
  { id: "erase", name: "普通石板", icon: Eraser },
  { id: "start", name: "入口", icon: Flag },
  { id: "relic-sun", name: "日轮徽记", icon: Gem },
  { id: "relic-vessel", name: "绿釉陶罐", icon: Gem },
  { id: "relic-tablet", name: "星象石板", icon: Gem },
];

export function PaintToolbar({
  tool,
  onSelect,
}: {
  tool: PaintTool;
  onSelect: (t: PaintTool) => void;
}) {
  return (
    <section className="panel paint-panel">
      <div className="panel-heading">
        <BrickWall size={15} />
        <h2>绘制工具</h2>
      </div>
      <div className="paint-grid">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={"paint-card " + (tool === t.id ? "selected" : "")}
              aria-pressed={tool === t.id}
              onClick={() => onSelect(t.id)}
            >
              <Icon size={17} />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function LevelSettings({
  level,
  onMeta,
  onResize,
  onTools,
}: {
  level: LevelContent;
  onMeta: (patch: Partial<Pick<LevelContent, "name" | "author" | "lives">>) => void;
  onResize: (w: number, h: number) => void;
  onTools: (patch: Partial<ToolBag>) => void;
}) {
  const relics = countRelics(level);
  const traps = countByHelper(level, "trap");
  const doors = countByHelper(level, "door");
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <Gem size={15} />
        <h2>关卡设定</h2>
      </div>
      <label className="field">
        <span>关卡名称</span>
        <input
          value={level.name}
          maxLength={40}
          onChange={(e) => onMeta({ name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>作者署名</span>
        <input
          value={level.author}
          maxLength={40}
          onChange={(e) => onMeta({ author: e.target.value })}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>宽度</span>
          <input
            type="number"
            min={MIN_W}
            max={MAX_W}
            value={level.width}
            onChange={(e) =>
              onResize(clamp(+e.target.value, MIN_W, MAX_W), level.height)
            }
          />
        </label>
        <label className="field">
          <span>高度</span>
          <input
            type="number"
            min={MIN_H}
            max={MAX_H}
            value={level.height}
            onChange={(e) =>
              onResize(level.width, clamp(+e.target.value, MIN_H, MAX_H))
            }
          />
        </label>
      </div>
      <div className="field">
        <span>
          <Heart size={12} /> 生命 {level.lives}
        </span>
        <input
          type="range"
          min={1}
          max={5}
          value={level.lives}
          onChange={(e) => onMeta({ lives: +e.target.value })}
        />
      </div>
      <div className="tool-stock-editor">
        <span className="stock-title">可用道具（试玩与证明共用此配额）</span>
        {(
          [
            ["probe", "勘探探针", ScanLine],
            ["flare", "照明火把", Flame],
            ["shield", "守护符石", ShieldCheck],
          ] as const
        ).map(([key, name, Icon]) => (
          <div key={key} className="stock-row">
            <Icon size={14} />
            <span>{name}</span>
            <div className="stepper">
              <button
                onClick={() => onTools({ [key]: Math.max(0, level.tools[key] - 1) })}
                aria-label={`减少${name}`}
              >
                −
              </button>
              <b>{level.tools[key]}</b>
              <button
                onClick={() => onTools({ [key]: Math.min(9, level.tools[key] + 1) })}
                aria-label={`增加${name}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="level-stats">
        <span>陷阱 <b>{traps}</b></span>
        <span>封门 <b>{doors}</b></span>
        <span>文物 <b>{relics}</b></span>
      </div>
    </section>
  );
}

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
