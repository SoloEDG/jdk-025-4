import { useState } from "react";
import { Share2, Upload, Copy, Check, Trophy, History } from "lucide-react";
import type { LevelPackage, PlayResult } from "../../../shared/level";
import type { ImportOutcome } from "../model/codec";

export function SharePanel({
  pkg,
  shareText,
  results,
  onImport,
  onCopy,
}: {
  pkg: LevelPackage | null;
  shareText: string;
  results: PlayResult[];
  onImport: (raw: string) => ImportOutcome;
  onCopy: (text: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const doImport = () => {
    const outcome = onImport(raw);
    setImportMsg({
      ok: outcome.ok,
      text: outcome.ok
        ? outcome.proofValid
          ? "导入成功，证明校验通过。"
          : "导入成功，但缺少随包有效证明。"
        : outcome.issues.map((i) => i.message).join("；"),
    });
    if (outcome.ok) setRaw("");
  };

  return (
    <section className="panel share-panel">
      <div className="panel-heading">
        <Share2 size={15} />
        <h2>分享与导入</h2>
      </div>

      {pkg ? (
        <div className="share-box">
          <p className="share-meta">
            已发布 <b>{pkg.content.name}</b> · 证明随包附带，他人导入即先校验。
          </p>
          <textarea readOnly value={shareText} rows={3} className="share-code" />
          <button
            className="outline-button"
            onClick={() => {
              onCopy(shareText);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "已复制" : "复制分享码"}
          </button>
        </div>
      ) : (
        <p className="verify-hint">尚未发布：验证通过并打包后，这里会生成可分享关卡码。</p>
      )}

      <div className="import-box">
        <span className="stock-title"><Upload size={12} /> 导入关卡（先校验再试玩）</span>
        <textarea
          rows={3}
          placeholder="粘贴 RF1: 开头的关卡分享码"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <button className="primary" disabled={!raw.trim()} onClick={doImport}>
          校验并导入
        </button>
        {importMsg && (
          <p className={"import-msg " + (importMsg.ok ? "ok" : "bad")}>{importMsg.text}</p>
        )}
      </div>

      <div className="results-box">
        <div className="panel-heading sub">
          <History size={14} />
          <h2>本机试玩成绩</h2>
        </div>
        {!results.length && <p className="verify-hint">还没有试玩记录。</p>}
        <ul className="result-list">
          {results.map((r) => (
            <li key={r.id} className={r.stale ? "stale" : ""}>
              <Trophy size={13} className={r.outcome === "won" ? "won" : "lost"} />
              <span>
                <b>{r.levelName}</b>
                <small>
                  {r.outcome === "won" ? "成功" : "失败"} · 文物 {r.relicsFound.length} ·{" "}
                  失误 {r.mistakes} · 道具 {r.used} · {r.seconds}s
                </small>
              </span>
              {r.stale && <em className="stale-tag">旧版本·不计成绩</em>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
