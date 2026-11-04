const LIMIT = 1000;
const MAX_FEN = 100000000;
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const clone = (value) => structuredClone(value);
const fail = (message) => {
  throw new Error(message);
};
function id(value) {
  if (typeof value !== "string" || !idPattern.test(value))
    fail("记录编号无效。");
}
function text(value, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail("请填写有效文字。");
  return value.trim();
}
function cents(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_FEN)
    fail("金额须为有效的正整数分。");
}
function time(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 4102444800000)
    fail("记录时间无效。");
}
function keys(event, allowed) {
  if (Object.keys(event).some((key) => !allowed.includes(key)))
    fail("记录包含不支持的字段。");
}
export function parseMoney(value) {
  if (
    typeof value !== "string" ||
    !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())
  )
    fail("金额最多保留两位小数。");
  const [whole, decimal = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  cents(amount);
  return amount;
}
export function money(value) {
  return `¥${(value / 100).toFixed(2)}`;
}
export function emptyJournal() {
  return { schema: 1, events: [] };
}
export function replay(journal) {
  if (
    !journal ||
    journal.schema !== 1 ||
    !Array.isArray(journal.events) ||
    journal.events.length > LIMIT ||
    Object.keys(journal).some((key) => !["schema", "events"].includes(key))
  )
    fail("这不是兼容的愿望记录。");
  const state = {
    goal: { name: "周末小旅行", target_fen: 50000 },
    wishes: [],
    deposits: [],
    lastAt: 0,
  };
  const ids = new Set();
  for (const event of journal.events) {
    if (!event || typeof event !== "object" || Array.isArray(event))
      fail("记录格式无效。");
    id(event.id);
    time(event.at);
    if (ids.has(event.id) || event.at < state.lastAt)
      fail("记录重复或时间顺序错误。");
    ids.add(event.id);
    state.lastAt = event.at;
    if (event.type === "goal") {
      keys(event, ["type", "id", "at", "name", "target_fen"]);
      cents(event.target_fen);
      state.goal = { name: text(event.name, 40), target_fen: event.target_fen };
    } else if (event.type === "wish") {
      keys(event, [
        "type",
        "id",
        "at",
        "title",
        "amount_fen",
        "cooldown_hours",
      ]);
      cents(event.amount_fen);
      if (![1, 24, 72].includes(event.cooldown_hours))
        fail("请选择 1、24 或 72 小时。");
      state.wishes.push({
        id: event.id,
        title: text(event.title, 60),
        amount_fen: event.amount_fen,
        created_at: event.at,
        ready_at: event.at + event.cooldown_hours * 3600000,
        status: "waiting",
        note: "",
      });
    } else if (event.type === "resolve") {
      keys(event, ["type", "id", "at", "wish_id", "choice", "note"]);
      id(event.wish_id);
      const wish = state.wishes.find((item) => item.id === event.wish_id);
      if (!wish || wish.status !== "waiting") fail("这个愿望已处理或不存在。");
      if (event.at < wish.ready_at) fail("愿望还在保鲜，请等冷静期结束。");
      if (!["buy", "release"].includes(event.choice)) fail("决定类型无效。");
      if (typeof event.note !== "string" || event.note.length > 280)
        fail("复盘文字过长。");
      wish.status = event.choice;
      wish.note = event.note;
      wish.resolved_at = event.at;
    } else if (event.type === "deposit") {
      keys(event, ["type", "id", "at", "amount_fen", "wish_id", "note"]);
      cents(event.amount_fen);
      if (typeof event.note !== "string" || event.note.length > 100)
        fail("备注最多 100 字。");
      if (event.wish_id !== null) {
        id(event.wish_id);
        const wish = state.wishes.find((item) => item.id === event.wish_id);
        if (!wish || wish.status !== "release")
          fail("只能关联已经放下的愿望。");
        const allocated = state.deposits
          .filter((item) => item.wish_id === wish.id && !item.reversed)
          .reduce((sum, item) => sum + item.amount_fen, 0);
        if (allocated + event.amount_fen > wish.amount_fen)
          fail("关联存入不能重复超过这份愿望金额。");
      }
      state.deposits.push({
        id: event.id,
        at: event.at,
        amount_fen: event.amount_fen,
        wish_id: event.wish_id,
        note: event.note,
        reversed: false,
      });
    } else if (event.type === "reverse") {
      keys(event, ["type", "id", "at", "deposit_id"]);
      id(event.deposit_id);
      const deposit = state.deposits.find(
        (item) => item.id === event.deposit_id,
      );
      if (!deposit || deposit.reversed) fail("这笔记录已撤销或不存在。");
      deposit.reversed = true;
    } else fail("不支持的记录类型。");
  }
  return state;
}
export function append(journal, event) {
  const next = { schema: 1, events: [...clone(journal.events), clone(event)] };
  replay(next);
  return next;
}
export function totals(state, now = Date.now()) {
  time(now);
  const released = state.wishes.filter((item) => item.status === "release");
  const deposits = state.deposits.filter((item) => !item.reversed);
  return {
    waiting: state.wishes.filter(
      (item) => item.status === "waiting" && item.ready_at > now,
    ).length,
    ready: state.wishes.filter(
      (item) => item.status === "waiting" && item.ready_at <= now,
    ).length,
    avoided_fen: released.reduce((sum, item) => sum + item.amount_fen, 0),
    reported_fen: deposits.reduce((sum, item) => sum + item.amount_fen, 0),
    bought: state.wishes.filter((item) => item.status === "buy").length,
    released: released.length,
    progress: Math.min(
      1,
      deposits.reduce((sum, item) => sum + item.amount_fen, 0) /
        state.goal.target_fen,
    ),
  };
}
export function remainingForWish(state, wishId) {
  const wish = state.wishes.find((item) => item.id === wishId);
  if (!wish || wish.status !== "release") return 0;
  return (
    wish.amount_fen -
    state.deposits
      .filter((item) => item.wish_id === wishId && !item.reversed)
      .reduce((sum, item) => sum + item.amount_fen, 0)
  );
}
export function parseBackup(value) {
  if (typeof value !== "string" || value.length > 1000000)
    fail("备份过大或格式不正确。");
  let data;
  try {
    data = JSON.parse(value);
  } catch {
    fail("备份不是有效的 JSON 文件。");
  }
  replay(data);
  return clone(data);
}
export function demoJournal(now = Date.now()) {
  const hour = 3600000;
  return {
    schema: 1,
    events: [
      {
        type: "wish",
        id: "demo-box",
        at: now - 80 * hour,
        title: "联名盲盒",
        amount_fen: 6900,
        cooldown_hours: 24,
      },
      {
        type: "resolve",
        id: "demo-release",
        at: now - 50 * hour,
        wish_id: "demo-box",
        choice: "release",
        note: "睡醒发现，我更期待和朋友去看海。",
      },
      {
        type: "deposit",
        id: "demo-deposit",
        at: now - 49 * hour,
        wish_id: "demo-box",
        amount_fen: 2000,
        note: "虚构演示记录，未发生转账",
      },
      {
        type: "wish",
        id: "demo-tea",
        at: now - 26 * hour,
        title: "加班后的第二杯奶茶",
        amount_fen: 2200,
        cooldown_hours: 24,
      },
      {
        type: "wish",
        id: "demo-light",
        at: now - 2 * hour,
        title: "让书桌更温柔的小台灯",
        amount_fen: 12900,
        cooldown_hours: 24,
      },
    ],
  };
}
