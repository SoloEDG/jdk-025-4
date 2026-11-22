import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { LevelPackage, PlayResult } from "../../../shared/level";
import {
  initialWorkshop,
  workshopReducer,
  type WorkshopState,
} from "./store";
import { verifyLevel } from "./solver";
import { validateStructure, hasErrors } from "./validate";
import { buildPackage, encodeShare, importPackage } from "./codec";
import { contentHash } from "./geometry";
import {
  startPlay,
  reveal,
  tick as playTick,
  useFlare,
  useProbe,
  useShield,
  toResult,
  type PlayState,
} from "./play";
import type { PlayEvent } from "./play";

const STORAGE_KEY = "ruinfield-workshop-v1";

function load(): WorkshopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkshop();
    const parsed = JSON.parse(raw) as WorkshopState;
    if (!parsed.draft || !Array.isArray(parsed.draft.cells))
      return initialWorkshop();
    // 恢复时重新计算哈希；与证明不一致则丢弃证明
    const hash = contentHash(parsed.draft);
    const proof =
      parsed.proof && parsed.proof.contentHash === hash ? parsed.proof : null;
    return {
      ...initialWorkshop(),
      ...parsed,
      hash,
      proof,
      verify: "idle",
      published:
        parsed.published &&
        parsed.published.proof?.contentHash === hash &&
        parsed.published.proof.verdict === "proved"
          ? parsed.published
          : null,
      results: (parsed.results ?? []).map((r) => ({
        ...r,
        stale: r.contentHash !== hash,
      })),
    };
  } catch {
    return initialWorkshop();
  }
}

export type PlayTool = "reveal" | "probe" | "flare" | "shield";

export function useWorkshop() {
  const [state, dispatch] = useReducer(workshopReducer, undefined, load);
  const [play, setPlay] = useState<PlayState | null>(null);
  const [shareText, setShareText] = useState("");
  const verifyToken = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 存储不可用时静默降级 */
    }
  }, [state]);

  // 试玩计时
  useEffect(() => {
    if (!play || play.status !== "active") return;
    const t = window.setInterval(() => setPlay((p) => (p ? playTick(p) : p)), 1000);
    return () => clearInterval(t);
  }, [play?.status]);

  // 作者编辑后，旧试玩不能带着旧答案继续：内容哈希变化即终止本局
  useEffect(() => {
    if (play && play.hash !== state.hash) {
      setPlay(null);
      dispatch({ type: "notice", text: "关卡已被修改，旧试玩因答案版本过期而终止。" });
    }
  }, [state.hash, play]);

  const issues = useMemo(
    () => validateStructure(state.draft),
    [state.draft],
  );
  const structureOk = !hasErrors(issues);

  const runVerify = useCallback(() => {
    if (!structureOk) {
      dispatch({
        type: "notice",
        text: "结构校验未通过，请先修正地图上的错误项再验证。",
      });
      return;
    }
    const token = ++verifyToken.current;
    dispatch({ type: "verify-start" });
    // 让「运行中」状态先渲染，再执行同步搜索
    window.setTimeout(() => {
      if (token !== verifyToken.current) return;
      const proof = verifyLevel(state.draft);
      if (token !== verifyToken.current) return;
      dispatch({ type: "verify-done", proof });
    }, 30);
  }, [state.draft, structureOk]);

  const cancelVerify = useCallback(() => {
    verifyToken.current++;
    dispatch({ type: "verify-cancel" });
  }, []);

  const publish = useCallback(() => {
    if (
      !structureOk ||
      !state.proof ||
      state.proof.verdict !== "proved" ||
      state.proof.contentHash !== state.hash
    ) {
      dispatch({ type: "notice", text: "只有与当前内容一致的证明通过后才能发布。" });
      return;
    }
    const pkg = buildPackage(state.draft, state.proof);
    dispatch({ type: "publish", pkg });
    setShareText(encodeShare(pkg));
  }, [state.proof, state.draft, state.hash, structureOk]);

  const importShare = useCallback((raw: string) => {
    const outcome = importPackage(raw);
    if (!outcome.ok || !outcome.pkg) return outcome;
    verifyToken.current++;
    setPlay(null);
    dispatch({ type: "import", pkg: outcome.pkg, proofValid: outcome.proofValid });
    return outcome;
  }, []);

  const beginPlay = useCallback(() => {
    if (!structureOk) {
      dispatch({ type: "notice", text: "结构校验未通过，不能开始试玩。" });
      return;
    }
    // 试玩锁定当前发布/草稿版本的快照
    setPlay(startPlay(state.draft, Date.now()));
  }, [state.draft, structureOk]);

  const playAction = useCallback(
    (tool: PlayTool, id: number) => {
      setPlay((p) => {
        if (!p) return p;
        if (tool === "reveal") return reveal(p, id);
        if (tool === "probe") return useProbe(p, id);
        if (tool === "flare") return useFlare(p, id);
        return p;
      });
    },
    [],
  );
  const playShield = useCallback(
    () => setPlay((p) => (p ? useShield(p) : p)),
    [],
  );

  const finishPlay = useCallback(() => {
    setPlay((p) => {
      if (p && p.status !== "active") {
        const result: PlayResult = { ...toResult(p), stale: p.hash !== state.hash };
        dispatch({ type: "result", result });
      }
      return null;
    });
  }, [state.hash]);

  const abandonPlay = useCallback(() => setPlay(null), []);

  const loadPackage = useCallback((pkg: LevelPackage) => {
    verifyToken.current++;
    setPlay(null);
    dispatch({
      type: "import",
      pkg,
      proofValid: !!pkg.proof && pkg.proof.contentHash === contentHash(pkg.content),
    });
  }, []);

  const playLog: PlayEvent[] = play?.log ?? [];

  return {
    state,
    dispatch,
    issues,
    structureOk,
    runVerify,
    cancelVerify,
    publish,
    shareText,
    setShareText,
    importShare,
    loadPackage,
    play,
    playLog,
    beginPlay,
    playAction,
    playShield,
    finishPlay,
    abandonPlay,
  };
}
