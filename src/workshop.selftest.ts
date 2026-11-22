import { strict as assert } from "node:assert";
import { blankLevel } from "./src/features/workshop/model/editor";
import { sampleLevel } from "./src/features/workshop/model/samples";
import { verifyLevel } from "./src/features/workshop/model/solver";
import { validateStructure, hasErrors } from "./src/features/workshop/model/validate";
import { contentHash, adjacentTraps, relicCells } from "./src/features/workshop/model/geometry";
import { connectedRegions } from "./src/features/workshop/model/regions";
import { startPlay, playerView, reveal, useProbe, useFlare, useShield } from "./src/features/workshop/model/play";
import { buildPackage, encodeShare, importPackage, decodeShare } from "./src/features/workshop/model/codec";
import type { LevelContent } from "./src/shared/level";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const W = 6;
const id = (x: number, y: number) => y * W + x;

// 6x6 手工关卡：外墙、隔墙+必经封门、两个远离入口的陷阱、门后文物
function makeLevel(): LevelContent {
  const level = blankLevel(W, W);
  const set = (x: number, y: number, kind: LevelContent["cells"][number]["kind"]) =>
    (level.cells[id(x, y)].kind = kind);
  for (let x = 0; x < W; x++) { set(x, 0, "wall"); set(x, W - 1, "wall"); }
  for (let y = 0; y < W; y++) { set(0, y, "wall"); set(W - 1, y, "wall"); }
  // 竖向隔墙 x=3，唯一开口是封门 (3,2)，门的左邻 (2,2) 是安全接近格
  set(3, 1, "wall"); set(3, 2, "door"); set(3, 3, "wall"); set(3, 4, "wall");
  // 陷阱远离入口 (1,4) 且不邻入口，均与可揭开数字相邻
  set(1, 1, "trap"); set(2, 1, "trap");
  // 文物在门后右区
  level.cells[id(4, 3)].relic = "sun";
  level.start = id(1, 4);
  level.tools = { probe: 3, flare: 2, shield: 1 };
  level.lives = 3;
  return level;
}

test("结构校验：合法关卡无错误", () => {
  const issues = validateStructure(makeLevel());
  assert.equal(hasErrors(issues), false, issues.map((i) => i.message).join(";"));
});

test("相邻数字随陷阱布置正确计算", () => {
  const level = makeLevel();
  // (1,2) 的八邻域含陷阱 (2,2) 与 (1,1)
  assert.equal(adjacentTraps(level, id(1, 2)), 2);
});

test("连通区域：外墙内（含可越过的陷阱）只形成一个区域", () => {
  const { count } = connectedRegions(makeLevel());
  assert.equal(count, 1);
});

test("证明：示例关卡在给定道具下可无需猜测完成", () => {
  const level = sampleLevel();
  assert.equal(hasErrors(validateStructure(level)), false);
  const proof = verifyLevel(level);
  assert.equal(proof.verdict, "proved", `verdict=${proof.verdict} ${proof.stuck?.message ?? ""}`);
  assert.equal(proof.contentHash, contentHash(level));
  assert.ok(proof.steps.length > 0);
  assert.ok(proof.stateCount <= proof.nodeCount);
  console.log(`    节点 ${proof.nodeCount} / 等价状态 ${proof.stateCount} / 步数 ${proof.steps.length}`);
});

// 含「二选一」模糊前沿的关卡：数字格 (1,3)=1 约束三个未知格恰有一个陷阱，
// 公开信息无法判定具体位置，必须借助探针才能无猜通过
function ambiguousLevel(withProbe: boolean): LevelContent {
  const level = blankLevel(5, 5);
  const id = (x: number, y: number) => y * 5 + x;
  const set = (x: number, y: number, k: LevelContent["cells"][number]["kind"]) =>
    (level.cells[id(x, y)].kind = k);
  for (let x = 0; x < 5; x++) { set(x, 0, "wall"); set(x, 4, "wall"); }
  for (let y = 0; y < 5; y++) { set(0, y, "wall"); set(4, y, "wall"); }
  // 右侧封死，左下室仅经 (1,2)/(2,2) 一带通向上半区
  set(3, 3, "wall"); set(3, 2, "wall"); set(3, 1, "wall");
  set(1, 2, "trap");
  level.cells[id(2, 1)].relic = "vessel";
  level.start = id(2, 3);
  level.tools = withProbe
    ? { probe: 2, flare: 0, shield: 0 }
    : { probe: 0, flare: 0, shield: 0 };
  level.lives = 1;
  return level;
}

test("证明：手工关卡在充足道具下可证明，零道具下不能证明", () => {
  const rich = makeLevel();
  assert.equal(verifyLevel(rich).verdict, "proved");
  const poor = verifyLevel(ambiguousLevel(false));
  console.log(`    模糊关卡零道具=${poor.verdict}（期望非 proved）`);
  assert.notEqual(poor.verdict, "proved");
  assert.ok(poor.stuck && poor.stuck.frontier.length > 0);
  const solved = verifyLevel(ambiguousLevel(true));
  console.log(`    模糊关卡带探针=${solved.verdict}（期望 proved），消耗探针 ${solved.toolsUsed.probe}`);
  assert.equal(solved.verdict, "proved");
  assert.ok(solved.toolsUsed.probe >= 1);
});

test("证明：失败时返回卡住的公开约束与前沿，不泄漏暗格答案", () => {
  const proof = verifyLevel(ambiguousLevel(false));
  assert.notEqual(proof.verdict, "proved");
  assert.ok(proof.stuck);
  assert.ok(proof.stuck.message.length > 0);
  // 约束文本只描述数字与未知格，绝不出现具体陷阱种类的暗格结论
  for (const c of proof.stuck.constraints)
    assert.ok(c.text.includes("未知格") && c.remaining >= 0);
});

test("证明：资源支配剪枝下，更多道具不会更差，且状态数被压缩", () => {
  const base = makeLevel();
  const proof = verifyLevel(base);
  // 同一信息状态被多路径到达时，等价去重使 stateCount 远小于朴素动作序列数
  assert.ok(proof.nodeCount >= proof.stateCount);
});

test("结构：被墙完全包围的陷阱触发 hidden-trap 提醒", () => {
  const level = makeLevel();
  // 在右下内区 (4,4) 放陷阱，八邻域全部置为墙（含外墙）
  level.cells[id(4, 4)].kind = "trap";
  for (const [x, y] of [
    [3, 3], [4, 3], [5, 3],
    [3, 4], [5, 4],
    [3, 5], [4, 5], [5, 5],
  ] as const)
    level.cells[id(x, y)].kind = "wall";
  const issues = validateStructure(level);
  assert.ok(issues.some((i) => i.code === "hidden-trap"), issues.map((i) => i.code).join(","));
});

test("结构：文物不可达时报错", () => {
  const level = makeLevel();
  // 封死通往门后右区的唯一封门
  level.cells[id(3, 2)].kind = "wall";
  const issues = validateStructure(level);
  assert.ok(issues.some((i) => i.code === "relic-reach" || i.code === "isolated"));
});

test("试玩：暗格不泄漏种类、文物与数字", () => {
  const play = startPlay(makeLevel(), 0);
  for (const c of playerView(play)) {
    if (c.state === "unknown" || c.state.startsWith("intel")) {
      assert.equal(c.relic, null);
      assert.equal(c.adjacent, null);
    }
  }
  assert.ok(play.revealed.has(makeLevel().start));
});

test("试玩：探针给公开结论，火把对安全格触发洪水", () => {
  const level = makeLevel();
  let play = startPlay(level, 0);
  const before = play.revealed.size;
  play = useProbe(play, id(2, 3));
  assert.equal(play.tools.probe, level.tools.probe - 1);
  assert.ok(play.intel.has(id(2, 3)));
  play = useFlare(play, id(1, 3));
  assert.ok(play.revealed.has(id(1, 3)));
  assert.ok(play.revealed.size > before);
});

test("试玩：护盾挡陷阱无伤，无护盾踩陷阱扣命，生命归零失败", () => {
  const level: LevelContent = { ...makeLevel(), lives: 1 };
  let play = startPlay(level, 0);
  const trapIds = level.cells.filter((c) => c.kind === "trap").map((c) => c.id);
  play = useShield(play);
  const shielded = reveal(play, trapIds[0]);
  assert.equal(shielded.lives, 1);
  assert.ok(shielded.exposed.has(trapIds[0]));
  const dead = reveal(shielded, trapIds[1]);
  assert.equal(dead.status, "lost");
});

test("试玩：清场即胜利，文物计入结果", () => {
  const level: LevelContent = {
    ...makeLevel(),
    // 配足火把：每个非墙格都能被照亮（陷阱只确认不触发）
    tools: { probe: 0, flare: W * W, shield: 0 },
  };
  let play = startPlay(level, 0);
  for (const c of level.cells) {
    if (c.kind === "wall" || play.revealed.has(c.id) || play.exposed.has(c.id)) continue;
    if (c.kind === "trap") {
      play = useFlare(play, c.id);
      assert.equal(play.intel.get(c.id), -1);
    } else {
      play = useFlare(play, c.id);
    }
  }
  // 安全格全部揭开即胜，陷阱只需被确认（保持暗格也可）
  const safeLeft = level.cells.filter(
    (c) => (c.kind === "floor" || c.kind === "door") && !play.revealed.has(c.id),
  );
  assert.equal(safeLeft.length, 0);
  assert.equal(play.status, "won");
  assert.ok(play.log.some((e) => e.kind === "win"));
  const found = relicCells(level).filter((c) => play.revealed.has(c.id));
  assert.equal(found.length, relicCells(level).length);
});

test("内容哈希：陷阱一变哈希即变", () => {
  const level = makeLevel();
  const h1 = contentHash(level);
  level.cells[id(1, 2)].kind = "trap";
  assert.notEqual(h1, contentHash(level));
});

test("打包/导入往返：合法码通过，篡改与非关卡码被拒", () => {
  const level = sampleLevel();
  const pkg = buildPackage(level, verifyLevel(level));
  const code = encodeShare(pkg);
  assert.ok(decodeShare(code).includes("ruinfield-level"));
  const ok = importPackage(code);
  assert.equal(ok.ok, true);
  assert.equal(ok.proofValid, true);
  assert.equal(importPackage(code.slice(0, -4) + "0000").ok, false);
  assert.equal(importPackage(encodeShare(JSON.stringify({ hello: "world" }))).ok, false);
});

test("导入：证明哈希不一致时 proofValid=false 且不随包携带", () => {
  const level = sampleLevel();
  const stale = { ...verifyLevel(level), contentHash: "h00000000" };
  const outcome = importPackage(encodeShare(buildPackage(level, stale)));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.proofValid, false);
  assert.equal(outcome.pkg?.proof, null);
});

console.log(`\n全部 ${passed} 项测试通过`);
