import {
  BadgeCheck,
  TriangleAlert,
  Hourglass,
  SearchCheck,
  CircleDashed,
} from "lucide-react";
import type { ProofRecord } from "../../../shared/level";
import type { VerifyStatus } from "../model/store";
import { coordinate } from "../model/geometry";

const VERDICT_TEXT: Record<ProofRecord["verdict"], string> = {
  proved: "已证明：给定道具下存在无需猜测的完整探索过程",
  unreachable: "存在无法从入口到达的文物",
  guess: "无法证明：某些前沿格在公开约束下必须猜测",
  cap: "搜索预算耗尽：信息状态过多，未能完成证明",
};

export function VerifyPanel({
  proof,
  status,
  hash,
  width,
  onRun,
  onCancel,
  onPublish,
  canPublish,
}: {
  proof: ProofRecord | null;
  status: VerifyStatus;
  hash: string;
  width: number;
  onRun: () => void;
  onCancel: () => void;
  onPublish: () => void;
  canPublish: boolean;
}) {
  const fresh = !!proof && proof.contentHash === hash;
  return (
    <section className="panel verify-panel">
      <div className="panel-heading">
        <SearchCheck size={15} />
        <h2>发布验证</h2>
        {status === "running" && <span className="verify-running"><Hourglass size={12} /> 运行中</span>}
      </div>

      <div className="verify-actions">
        {status !== "running" ? (
          <button className="primary" onClick={onRun}>
            <SearchCheck size={14} />
            {proof ? "重新验证" : "开始验证"}
          </button>
        ) : (
          <button className="outline-button" onClick={onCancel}>
            <CircleDashed size={14} /> 取消
          </button>
        )}
        <button className="primary publish-btn" disabled={!canPublish} onClick={onPublish}>
          <BadgeCheck size={14} /> 打包发布
        </button>
      </div>

      {!proof && status !== "running" && (
        <p className="verify-hint">
          验证只使用玩家可见的数字与道具结论，不读取暗格答案；
          通过状态等价去重与资源支配剪枝压缩搜索空间。
        </p>
      )}
      {proof && fresh && (
        <div className={"proof-result verdict-" + proof.verdict}>
          <div className="verdict-line">
            {proof.verdict === "proved" ? (
              <BadgeCheck size={18} />
            ) : (
              <TriangleAlert size={18} />
            )}
            <strong>{VERDICT_TEXT[proof.verdict]}</strong>
          </div>
          <div className="proof-stats">
            <span>搜索节点 <b>{proof.nodeCount}</b></span>
            <span>等价信息状态 <b>{proof.stateCount}</b></span>
            <span>证明步数 <b>{proof.steps.length}</b></span>
            <span>
              道具 <b>
                探{proof.toolsUsed.probe}/火{proof.toolsUsed.flare}/盾{proof.toolsUsed.shield}
              </b>
            </span>
          </div>

          {proof.verdict === "proved" && (
            <details className="proof-steps">
              <summary>查看无需猜测的证明路线（{proof.steps.length} 步）</summary>
              <ol>
                {proof.steps.slice(0, 60).map((s, i) => (
                  <li key={i}>
                    <em>{stepLabel(s.kind)}</em>
                    {s.cell !== null && <b>{coordinate(s.cell, width)}</b>}
                    <span>{s.reason}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {proof.stuck && (
            <div className="stuck-box">
              <h4>
                无法证明时卡在哪组公开约束（已访问 {proof.stuck.visitedStates} 个信息状态）
              </h4>
              <p className="stuck-msg">{proof.stuck.message}</p>
              <ul className="stuck-constraints">
                {proof.stuck.constraints.slice(0, 8).map((c, i) => (
                  <li key={i}>{c.text}</li>
                ))}
              </ul>
              <div className="stuck-frontier">
                待决策前沿：
                {proof.stuck.frontier.slice(0, 12).map((id) => (
                  <span key={id} className="frontier-chip">
                    {coordinate(id, width)}
                  </span>
                ))}
              </div>
              {proof.stuck.missingRelics.length > 0 && (
                <p className="stuck-relics">
                  仍未能到达的文物格：
                  {proof.stuck.missingRelics.map((id) => (
                    <span key={id} className="frontier-chip">{coordinate(id, width)}</span>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {proof && !fresh && (
        <p className="verify-hint stale-proof">
          <TriangleAlert size={13} /> 当前证明属于旧版本内容，编辑后已失效，请重新验证。
        </p>
      )}
    </section>
  );
}

function stepLabel(kind: ProofRecord["steps"][number]["kind"]) {
  return {
    reveal: "探索",
    probe: "探针",
    flare: "火把",
    shield: "护盾",
    door: "封门",
  }[kind];
}
