import type {
  LevelContent,
  LevelPackage,
  PlayResult,
  ProofRecord,
} from "../../../shared/level";
import { blankLevel, applyPaint, resizeLevel, type PaintTool } from "./editor";
import { contentHash } from "./geometry";

export type VerifyStatus = "idle" | "running" | "done";

export interface WorkshopState {
  draft: LevelContent;
  /** 草稿最近一次内容哈希，用于判断编辑后哪些证明/试玩已过期 */
  hash: string;
  proof: ProofRecord | null;
  verify: VerifyStatus;
  /** 已发布的关卡包；只有证明与当前内容一致时才存在 */
  published: LevelPackage | null;
  results: PlayResult[];
  notice: string;
}

export type WorkshopAction =
  | { type: "paint"; tool: PaintTool; id: number }
  | {
      type: "meta";
      patch: Partial<Pick<LevelContent, "name" | "author" | "lives">>;
    }
  | { type: "resize"; width: number; height: number }
  | { type: "tools"; patch: Partial<LevelContent["tools"]> }
  | { type: "load"; level: LevelContent }
  | { type: "reset" }
  | { type: "sample" }
  | { type: "verify-start" }
  | { type: "verify-cancel" }
  | { type: "verify-done"; proof: ProofRecord }
  | { type: "publish"; pkg: LevelPackage }
  | { type: "import"; pkg: LevelPackage; proofValid: boolean }
  | { type: "result"; result: PlayResult }
  | { type: "notice"; text: string };

export function initialWorkshop(): WorkshopState {
  const draft = blankLevel();
  return {
    draft,
    hash: contentHash(draft),
    proof: null,
    verify: "idle",
    published: null,
    results: [],
    notice: "欢迎使用关卡台：先绘制边界，再布置陷阱、文物与封门。",
  };
}

/** 任何内容改动都使旧证明、旧发布失效；旧试玩成绩标记为过期 */
function invalidateAfterEdit(
  state: WorkshopState,
  draft: LevelContent,
  notice: string,
): WorkshopState {
  const hash = contentHash(draft);
  return {
    ...state,
    draft,
    hash,
    proof: null,
    verify: "idle",
    published: null,
    results: state.results.map((r) =>
      r.contentHash === hash ? r : { ...r, stale: true },
    ),
    notice,
  };
}

export function workshopReducer(
  state: WorkshopState,
  action: WorkshopAction,
): WorkshopState {
  switch (action.type) {
    case "paint": {
      const draft = paintWithGuard(state.draft, action.tool, action.id);
      if (draft === state.draft) return state;
      return invalidateAfterEdit(state, draft, "已修改石板：相邻数字、连通区域与验证结论已重算，旧证明已失效。");
    }
    case "meta": {
      const draft: LevelContent = { ...state.draft, ...action.patch };
      // 名称/作者不参与内容哈希，不使证明失效
      const hashChanging =
        action.patch.lives !== undefined && action.patch.lives !== state.draft.lives;
      if (!hashChanging)
        return { ...state, draft, notice: "关卡资料已更新。" };
      return invalidateAfterEdit(state, draft, "生命设置已变更，需要重新验证。");
    }
    case "resize": {
      const draft = resizeWithGuard(state.draft, action.width, action.height);
      return invalidateAfterEdit(state, draft, "地图尺寸已变更，需要重新验证。");
    }
    case "tools": {
      const draft: LevelContent = {
        ...state.draft,
        tools: { ...state.draft.tools, ...action.patch },
      };
      return invalidateAfterEdit(state, draft, "可用道具已变更，证明与发布版本已重置。");
    }
    case "load":
      return invalidateAfterEdit(
        { ...initialWorkshop(), results: state.results },
        action.level,
        "已载入关卡草稿。",
      );
    case "reset":
      return invalidateAfterEdit(
        { ...initialWorkshop(), results: state.results },
        blankLevel(),
        "已清空画布。",
      );
    case "verify-start":
      return { ...state, verify: "running", notice: "正在穷举信息状态，验证无需猜测的完整探索过程…" };
    case "verify-cancel":
      return { ...state, verify: "idle", notice: "已取消本次验证。" };
    case "verify-done": {
      const valid = action.proof.contentHash === state.hash;
      return {
        ...state,
        verify: "done",
        proof: valid ? action.proof : state.proof,
        notice: valid
          ? action.proof.verdict === "proved"
            ? "验证通过：存在无需猜测的完整探索过程，可以发布。"
            : "验证未通过：已在下方展示卡住时的公开约束。"
          : "证明属于旧版本内容，已拒绝采用。",
      };
    }
    case "publish":
      if (
        action.pkg.proof?.verdict !== "proved" ||
        action.pkg.proof.contentHash !== state.hash
      )
        return { ...state, notice: "发布被拒绝：证明与当前关卡内容不一致。" };
      return {
        ...state,
        published: action.pkg,
        notice: "关卡已打包发布，分享码可发送给其他勘者。",
      };
    case "import": {
      const importedHash = contentHash(action.pkg.content);
      return {
        ...initialWorkshop(),
        results: state.results.map((r) =>
          r.contentHash === importedHash ? r : { ...r, stale: true },
        ),
        draft: action.pkg.content,
        hash: importedHash,
        proof: action.pkg.proof,
        verify: action.proofValid ? "done" : "idle",
        published: action.proofValid ? action.pkg : null,
        notice: action.proofValid
          ? "关卡导入成功，证明校验通过，可直接试玩。"
          : "关卡结构校验通过，但缺少有效证明：可试玩，发布前需重新验证。",
      };
    }
    case "result":
      return { ...state, results: [action.result, ...state.results].slice(0, 30) };
    case "notice":
      return { ...state, notice: action.text };
    default:
      return state;
  }
}

function paintWithGuard(
  level: LevelContent,
  tool: PaintTool,
  id: number,
): LevelContent {
  return applyPaint(level, tool, id);
}
function resizeWithGuard(
  level: LevelContent,
  width: number,
  height: number,
): LevelContent {
  return resizeLevel(level, width, height);
}
