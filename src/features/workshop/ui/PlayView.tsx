import { useMemo, useState } from "react";
import {
  TriangleAlert,
  Gem,
  DoorOpen,
  Heart,
  ShieldCheck,
  ScanLine,
  Flame,
  Pickaxe,
  LogOut,
  Eye,
  Home,
} from "lucide-react";
import type { PlayState } from "../model/play";
import { playerView, publicAnalysis, relicsFound } from "../model/play";
import { coordinate, relicCells } from "../model/geometry";
import type { PlayTool } from "../model/useWorkshop";
import type { RelicId } from "../../../shared/level";

const RELIC_SYMBOL: Record<RelicId, string> = {
  sun: "☼",
  vessel: "♜",
  tablet: "⌘",
};

export function PlayView({
  play,
  onAction,
  onShield,
  onExit,
}: {
  play: PlayState;
  onAction: (tool: PlayTool, id: number) => void;
  onShield: () => void;
  onExit: () => void;
}) {
  const [tool, setTool] = useState<PlayTool>("reveal");
  const [showLogic, setShowLogic] = useState(true);
  const view = useMemo(() => playerView(play), [play]);
  const belief = useMemo(() => publicAnalysis(play), [play]);
  const totalRelics = relicCells(play.level).length;
  const found = relicsFound(play);
  const ended = play.status !== "active";

  return (
    <section className="board-panel play-panel">
      <div className="board-heading">
        <div>
          <span className="eyebrow">FIELD TRIAL / PLAYER VIEW</span>
          <h2>
            试玩 · {play.level.name}
            <span>只显示公开信息 · 版本 {play.hash.slice(0, 6)}</span>
          </h2>
        </div>
        <div className="board-actions">
          <span className={`play-status ${ended ? "ended" : ""}`}>
            {play.status === "active" ? "探险进行中" : play.status === "won" ? "探险成功" : "探险失败"}
          </span>
        </div>
      </div>

      <div className="play-vitals">
        <span>
          {Array.from({ length: play.level.lives }, (_, i) => (
            <Heart
              key={i}
              size={14}
              className={i < play.lives ? "heart-full" : "heart-empty"}
            />
          ))}
        </span>
        {play.shieldActive && (
          <span className="shield-badge"><ShieldCheck size={14} /> 护盾生效中</span>
        )}
        <span>文物 {found.length}/{totalRelics}</span>
        <span>用时 {play.elapsed}s</span>
        <button className="outline-button logic-toggle" onClick={() => setShowLogic(!showLogic)}>
          <Eye size={13} /> {showLogic ? "隐藏推理高亮" : "显示推理高亮"}
        </button>
      </div>

      <div className="map-area">
        <div
          role="grid"
          aria-label="试玩地图"
          className="board-grid play-grid"
          style={{ gridTemplateColumns: `repeat(${play.level.width},1fr)` }}
        >
          {view.map((c) => {
            const safeHint = showLogic && c.provablySafe;
            const dangerHint = showLogic && c.provablyDanger;
            return (
              <button
                role="gridcell"
                key={c.id}
                aria-label={ariaOf(c, play.level.width)}
                className={[
                  "tile",
                  "play-tile",
                  c.state === "wall" ? "ws-wall" : "",
                  c.state === "open" ? "open" : "closed",
                  c.state === "exposed-trap" ? "hazard" : "",
                  c.state === "intel-safe" ? "intel-safe" : "",
                  c.state === "intel-danger" ? "intel-danger" : "",
                  safeHint ? "hint-safe" : "",
                  dangerHint ? "hint-danger" : "",
                  c.isDoor && c.state === "open" ? "door-open" : "",
                ].join(" ")}
                disabled={ended || c.state === "wall" || c.state === "open"}
                onClick={() => {
                  if (tool === "shield") return;
                  onAction(tool, c.id);
                }}
              >
                {c.state === "open" ? (
                  c.isDoor ? (
                    <DoorOpen size={15} />
                  ) : c.relic ? (
                    <span className="relic-glyph">{RELIC_SYMBOL[c.relic]}</span>
                  ) : c.adjacent ? (
                    <span className={"number-" + c.adjacent}>{c.adjacent}</span>
                  ) : (
                    <span className="stone-dot">·</span>
                  )
                ) : c.state === "exposed-trap" ? (
                  <TriangleAlert size={15} />
                ) : c.state === "intel-safe" ? (
                  <ShieldCheck size={14} />
                ) : c.state === "intel-danger" ? (
                  <TriangleAlert size={14} />
                ) : (
                  <span className="unknown-glyph" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="action-bar play-tools">
        <button className={tool === "reveal" ? "active" : ""} onClick={() => setTool("reveal")}>
          <Pickaxe size={15} /> 探索
        </button>
        <button
          className={tool === "probe" ? "active" : ""}
          disabled={play.tools.probe <= 0}
          onClick={() => setTool("probe")}
        >
          <ScanLine size={15} /> 探针 ×{play.tools.probe}
        </button>
        <button
          className={tool === "flare" ? "active" : ""}
          disabled={play.tools.flare <= 0}
          onClick={() => setTool("flare")}
        >
          <Flame size={15} /> 火把 ×{play.tools.flare}
        </button>
        <button
          className={play.shieldActive ? "active" : ""}
          disabled={play.tools.shield <= 0 || play.shieldActive}
          onClick={onShield}
        >
          <ShieldCheck size={15} /> 护盾 ×{play.tools.shield}
        </button>
        <button className="extract-button" onClick={onExit}>
          {ended ? <Home size={14} /> : <LogOut size={14} />}
          {ended ? "返回工作台" : "放弃试玩"}
        </button>
      </div>

      <div className="play-log" aria-live="polite">
        {play.log.slice(-6).map((e, i) => (
          <p key={i} className={"log-line log-" + e.kind}>{e.message}</p>
        ))}
      </div>
      <p className="logic-caution">
        <Gem size={11} /> 暗格的陷阱、封门与文物在揭开前不可见；推理高亮仅由公开数字推出，不代表系统提示答案。
        当前一致陷阱配置 {belief.models} 组。
      </p>
    </section>
  );
}

function ariaOf(c: ReturnType<typeof playerView>[number], width: number) {
  const base = coordinate(c.id, width);
  switch (c.state) {
    case "wall": return `${base} 边界墙`;
    case "open": return `${base} 已探索${c.adjacent ? `，邻近陷阱 ${c.adjacent}` : ""}${c.relic ? "，发现文物" : ""}`;
    case "exposed-trap": return `${base} 已暴露陷阱`;
    case "intel-safe": return `${base} 道具确认安全，未探索`;
    case "intel-danger": return `${base} 道具确认危险，未探索`;
    default: return `${base} 未知石板`;
  }
}
