import { useEffect, useRef, useState } from "react";
import { Hammer, FlaskConical, Sparkles, Trash2, PlayCircle } from "lucide-react";
import { useWorkshop } from "../model/useWorkshop";
import type { PaintTool } from "../model/editor";
import { sampleLevel } from "../model/samples";
import { EditorBoard } from "./EditorBoard";
import { PaintToolbar, LevelSettings } from "./PaintToolbar";
import { VerifyPanel } from "./VerifyPanel";
import { IssuesPanel } from "./IssuesPanel";
import { SharePanel } from "./SharePanel";
import { PlayView } from "./PlayView";

export function WorkshopView() {
  const ws = useWorkshop();
  const { state, dispatch } = ws;
  const [tool, setTool] = useState<PaintTool>("wall");
  const recorded = useRef<string | null>(null);

  // 试玩结束即结算；同一会话只结算一次，过期版本不计成绩
  useEffect(() => {
    const p = ws.play;
    if (p && p.status !== "active" && recorded.current !== p.hash + p.startedAt) {
      recorded.current = p.hash + p.startedAt;
      ws.finishPlay();
    }
    if (!p) recorded.current = null;
  }, [ws.play, ws.finishPlay]);

  const canPublish =
    ws.structureOk &&
    !!state.proof &&
    state.proof.verdict === "proved" &&
    state.proof.contentHash === state.hash;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  if (ws.play) {
    return (
      <div className="workshop-shell">
        <WorkshopHeader
          title="试玩模式"
          subtitle="你只看得到公开信息，与正式探险完全一致"
          onBack={ws.abandonPlay}
        />
        <div className="workspace workshop-workspace">
          <div className="center-column">
            <PlayView
              play={ws.play}
              onAction={ws.playAction}
              onShield={ws.playShield}
              onExit={ws.abandonPlay}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workshop-shell">
      <WorkshopHeader
        title="关卡台"
        subtitle="为其他勘者制作遗迹：绘制、布置、验证、试玩与分享"
      />
      <div className="workspace workshop-workspace">
        <aside className="left-column workshop-left">
          <PaintToolbar tool={tool} onSelect={setTool} />
          <LevelSettings
            level={state.draft}
            onMeta={(patch) => dispatch({ type: "meta", patch })}
            onResize={(width, height) => dispatch({ type: "resize", width, height })}
            onTools={(patch) => dispatch({ type: "tools", patch })}
          />
          <div className="workshop-actions">
            <button className="outline-button" onClick={ws.beginPlay} disabled={!ws.structureOk}>
              <PlayCircle size={14} /> 试玩
            </button>
            <button
              className="outline-button"
              onClick={() => dispatch({ type: "load", level: sampleLevel() })}
            >
              <Sparkles size={14} /> 载入示例
            </button>
            <button className="outline-button danger" onClick={() => dispatch({ type: "reset" })}>
              <Trash2 size={14} /> 清空
            </button>
          </div>
        </aside>

        <div className="center-column">
          <EditorBoard
            level={state.draft}
            tool={tool}
            issues={ws.issues}
            onPaint={(t, id) => dispatch({ type: "paint", tool: t, id })}
          />
          <div className="workshop-notice" role="status">
            <FlaskConical size={13} />
            {state.notice}
          </div>
        </div>

        <aside className="right-column workshop-right">
          <IssuesPanel issues={ws.issues} level={state.draft} />
          <VerifyPanel
            proof={state.proof}
            status={state.verify}
            hash={state.hash}
            width={state.draft.width}
            onRun={ws.runVerify}
            onCancel={ws.cancelVerify}
            onPublish={ws.publish}
            canPublish={canPublish}
          />
          <SharePanel
            pkg={state.published}
            shareText={ws.shareText}
            results={state.results}
            onImport={ws.importShare}
            onCopy={copy}
          />
        </aside>
      </div>
    </div>
  );
}

function WorkshopHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
}) {
  return (
    <div className="page-heading workshop-heading">
      <div>
        <span className="eyebrow">
          <Hammer size={11} /> RUIN BUILDER / LEVEL WORKBENCH
        </span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {onBack && (
        <button className="new-expedition" onClick={onBack}>
          返回创作视图
        </button>
      )}
    </div>
  );
}
