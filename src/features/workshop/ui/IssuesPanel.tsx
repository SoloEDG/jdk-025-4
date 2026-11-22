import { TriangleAlert, AlertTriangle, CircleCheck } from "lucide-react";
import type { LevelIssue } from "../model/validate";
import { coordinate } from "../model/geometry";
import type { LevelContent } from "../../../shared/level";

export function IssuesPanel({
  issues,
  level,
}: {
  issues: LevelIssue[];
  level: LevelContent;
}) {
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return (
    <section className="panel issues-panel">
      <div className="panel-heading">
        {errors.length ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
        <h2>结构校验</h2>
        <span>{errors.length} 错误 · {warnings.length} 提醒</span>
      </div>
      {!issues.length && (
        <p className="verify-hint ok">
          <CircleCheck size={13} /> 边界、入口、文物连通与封门必要性均通过。
        </p>
      )}
      <ul className="issue-list">
        {issues.map((issue, i) => (
          <li key={i} className={"issue " + issue.level}>
            {issue.level === "error" ? (
              <TriangleAlert size={13} />
            ) : (
              <AlertTriangle size={13} />
            )}
            <span>
              {issue.cell !== undefined && (
                <b>{coordinate(issue.cell, level.width)} </b>
              )}
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
