import type {
  LevelContent,
  LevelPackage,
  ProofRecord,
  ProofStep,
  ToolBag,
} from "../../../shared/level";
import { contentHash } from "./geometry";
import { validateStructure, hasErrors, type LevelIssue } from "./validate";

const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const str = (v: unknown) => typeof v === "string";

const RELICS = ["sun", "vessel", "tablet"];
const KINDS = ["wall", "floor", "trap", "door"];
const TOOL_KEYS = ["probe", "flare", "shield"] as const;
const STEP_KINDS = ["reveal", "probe", "flare", "shield", "door"];

export function parseToolBag(v: unknown): ToolBag | null {
  if (!obj(v)) return null;
  for (const k of TOOL_KEYS) if (!int(v[k]) || (v[k] as number) < 0) return null;
  return {
    probe: v.probe as number,
    flare: v.flare as number,
    shield: v.shield as number,
  };
}

/** 宽容解析任意 JSON 为 LevelContent；结构问题交给 validateStructure 汇总 */
export function parseContent(v: unknown): LevelContent | null {
  if (!obj(v) || v.format !== 1) return null;
  if (!int(v.width) || !int(v.height) || !str(v.name) || !str(v.author))
    return null;
  const tools = parseToolBag(v.tools);
  if (!tools || !int(v.start) || !int(v.lives)) return null;
  if (!Array.isArray(v.cells)) return null;
  const width = v.width as number,
    height = v.height as number;
  if (v.cells.length !== width * height) return null;
  const cells: LevelContent["cells"] = [];
  for (let i = 0; i < v.cells.length; i++) {
    const c = v.cells[i];
    if (
      !obj(c) ||
      c.id !== i ||
      !str(c.kind) ||
      !KINDS.includes(c.kind as string) ||
      !(c.relic === null || (str(c.relic) && RELICS.includes(c.relic as string)))
    )
      return null;
    cells.push({
      id: i,
      kind: c.kind as LevelContent["cells"][number]["kind"],
      relic: (c.relic as LevelContent["cells"][number]["relic"]) ?? null,
    });
  }
  const start = v.start as number;
  if (start < 0 || start >= cells.length) return null;
  return {
    format: 1,
    width,
    height,
    name: (v.name as string).slice(0, 40),
    author: (v.author as string).slice(0, 40),
    cells,
    start,
    tools,
    lives: v.lives as number,
  };
}

export function parseProof(v: unknown): ProofRecord | null {
  if (!obj(v)) return null;
  if (
    !["proved", "unreachable", "guess", "cap"].includes(String(v.verdict)) ||
    !str(v.contentHash) ||
    !Array.isArray(v.steps) ||
    !int(v.nodeCount) ||
    !int(v.stateCount) ||
    !int(v.revealedSafe) ||
    !int(v.totalSafe) ||
    !int(v.checkedAt)
  )
    return null;
  const toolsUsed = parseToolBag(v.toolsUsed);
  if (!toolsUsed) return null;
  const steps: ProofStep[] = [];
  for (const raw of v.steps) {
    if (
      !obj(raw) ||
      !str(raw.kind) ||
      !STEP_KINDS.includes(raw.kind as string) ||
      !(raw.cell === null || int(raw.cell)) ||
      !str(raw.reason)
    )
      return null;
    steps.push({
      kind: raw.kind as ProofStep["kind"],
      cell: raw.cell as number | null,
      reason: raw.reason as string,
    });
  }
  const stuck = v.stuck ?? null;
  return {
    verdict: v.verdict as ProofRecord["verdict"],
    contentHash: v.contentHash as string,
    steps,
    toolsUsed,
    revealedSafe: v.revealedSafe as number,
    totalSafe: v.totalSafe as number,
    nodeCount: v.nodeCount as number,
    stateCount: v.stateCount as number,
    stuck: parseStuck(stuck),
    checkedAt: v.checkedAt as number,
  };
}

function parseStuck(v: unknown): ProofRecord["stuck"] {
  if (v === null || v === undefined) return null;
  if (!obj(v) || !Array.isArray(v.frontier) || !Array.isArray(v.constraints))
    return null;
  if (
    !v.frontier.every(int) ||
    !Array.isArray(v.reachedRelics) ||
    !v.reachedRelics.every(int) ||
    !Array.isArray(v.missingRelics) ||
    !v.missingRelics.every(int) ||
    !int(v.visitedStates) ||
    !str(v.message)
  )
    return null;
  const constraints = [];
  for (const c of v.constraints) {
    if (
      !obj(c) ||
      !int(c.source) ||
      !Array.isArray(c.unknown) ||
      !c.unknown.every(int) ||
      !int(c.remaining) ||
      !str(c.text)
    )
      return null;
    constraints.push({
      source: c.source as number,
      unknown: c.unknown as number[],
      remaining: c.remaining as number,
      text: c.text as string,
    });
  }
  return {
    frontier: v.frontier as number[],
    constraints,
    reachedRelics: v.reachedRelics as number[],
    missingRelics: v.missingRelics as number[],
    visitedStates: v.visitedStates as number,
    message: v.message as string,
  };
}

export interface ImportOutcome {
  ok: boolean;
  pkg?: LevelPackage;
  issues: LevelIssue[];
  proofValid: boolean;
}

/**
 * 导入关卡：先做结构校验，再核对证明与内容哈希。
 * 校验未通过的关卡不允许进入试玩。
 */
export function importPackage(raw: string): ImportOutcome {
  let json: unknown;
  try {
    json = JSON.parse(decodeShare(raw));
  } catch {
    return { ok: false, issues: [{ level: "error", code: "decode", message: "分享码无法解码或不是合法 JSON" }], proofValid: false };
  }
  if (!obj(json) || json.kind !== "ruinfield-level" || json.format !== 1)
    return { ok: false, issues: [{ level: "error", code: "format", message: "不是遗迹探勘关卡包（缺少 ruinfield-level 标识）" }], proofValid: false };
  const content = parseContent(json.content);
  if (!content)
    return { ok: false, issues: [{ level: "error", code: "schema", message: "关卡内容结构不合法，已拒绝导入" }], proofValid: false };
  const issues = validateStructure(content);
  if (hasErrors(issues)) return { ok: false, issues, proofValid: false };

  const proof = json.proof ? parseProof(json.proof) : null;
  const proofValid =
    !!proof &&
    proof.verdict === "proved" &&
    proof.contentHash === contentHash(content);
  const pkg: LevelPackage = {
    format: 1,
    kind: "ruinfield-level",
    content,
    proof: proofValid ? proof : null,
    createdAt: int(json.createdAt) ? (json.createdAt as number) : Date.now(),
  };
  return { ok: true, pkg, issues, proofValid };
}

export function buildPackage(
  content: LevelContent,
  proof: ProofRecord | null,
): LevelPackage {
  const hash = contentHash(content);
  return {
    format: 1,
    kind: "ruinfield-level",
    content,
    proof: proof && proof.verdict === "proved" && proof.contentHash === hash ? proof : null,
    createdAt: Date.now(),
  };
}

export function encodeShare(pkg: LevelPackage): string {
  return encodeShareText(JSON.stringify(pkg));
}

// URL 安全的 base64，附加校验和防止手抄截断
export function encodeShareText(text: string): string {
  const b64 = btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  let check = 0;
  for (const ch of b64) check = (check + ch.charCodeAt(0)) % 65521;
  return `RF1:${b64}:${check.toString(16).padStart(4, "0")}`;
}

export function decodeShare(raw: string): string {
  const text = raw.trim();
  const m = text.match(/^RF1:([A-Za-z0-9_-]+):([0-9a-f]{4})$/);
  if (!m) throw new Error("bad share prefix");
  let check = 0;
  for (const ch of m[1]) check = (check + ch.charCodeAt(0)) % 65521;
  if (check.toString(16).padStart(4, "0") !== m[2])
    throw new Error("checksum mismatch");
  const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}
