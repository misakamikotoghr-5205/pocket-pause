import {
  emptyJournal,
  replay,
  append,
  totals,
  money,
  parseMoney,
  parseBackup,
  remainingForWish,
  demoJournal,
} from "./domain.js";
import { load, save } from "./persistence.js";
const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const date = (value) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
let journal = emptyJournal(),
  state = replay(journal),
  filter = "waiting",
  busy = false,
  activeWish = null,
  depositWish = null,
  pendingReplacement = null;
const uid = () => crypto.randomUUID();
const event = (type, fields) => ({
  type,
  id: uid(),
  at: Math.max(Date.now(), state.lastAt),
  ...fields,
});
function notice(message = "", error = false) {
  $("#notice").textContent = message;
  $("#notice").classList.toggle("error", error);
}
function storageLabel(backend) {
  $("#storage-status").textContent =
    backend === "memory" ? "暂未保存，请导出备份" : "记录在本机";
}
function showError(form, error) {
  let element = form.querySelector(".form-error");
  if (!element) {
    element = document.createElement("p");
    element.className = "form-error";
    element.setAttribute("role", "alert");
    form.append(element);
  }
  element.textContent = error.message || "操作未完成，请检查输入。";
}
function openDialog(id) {
  const dialog = $(id);
  dialog.querySelector(".form-error")?.remove();
  dialog.showModal();
}
async function commit(nextEvent) {
  if (busy) throw Error("上一笔还在保存，请稍候。");
  busy = true;
  try {
    const next = append(journal, nextEvent);
    const backend = await save(next);
    journal = next;
    state = replay(journal);
    storageLabel(backend);
    render();
    if (backend === "memory")
      notice("浏览器未能保存。当前页仍可使用，请导出备份后再关闭。", true);
  } finally {
    busy = false;
  }
}
function render() {
  const focused = document.activeElement;
  const restoreAttribute = [
    "data-resolve",
    "data-deposit",
    "data-reverse",
  ].find((attribute) => focused?.hasAttribute(attribute));
  const restoreValue = restoreAttribute
    ? focused.getAttribute(restoreAttribute)
    : null;
  const now = Date.now(),
    stats = totals(state, now);
  $("#waiting-count").textContent = stats.waiting;
  $("#avoided-total").textContent = money(stats.avoided_fen);
  $("#deposit-total").textContent = money(stats.reported_fen);
  $("#tab-waiting").textContent = stats.waiting;
  $("#tab-ready").textContent = stats.ready;
  $("#tab-archive").textContent = stats.bought + stats.released;
  $("#goal-name").textContent = state.goal.name;
  $("#goal-saved").textContent = money(stats.reported_fen);
  $("#goal-target").textContent = money(state.goal.target_fen);
  $("#goal-progress").value = stats.progress;
  document
    .querySelectorAll("[data-filter]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", button.dataset.filter === filter),
    );
  const wishes = state.wishes
    .filter((wish) =>
      filter === "archive"
        ? wish.status !== "waiting"
        : wish.status === "waiting" &&
          (filter === "ready" ? wish.ready_at <= now : wish.ready_at > now),
    )
    .toReversed();
  $("#wish-list").innerHTML =
    wishes
      .map((wish) => {
        const ready = wish.status === "waiting" && wish.ready_at <= now;
        const remaining = Math.max(0, Math.ceil((wish.ready_at - now) / 60000));
        const label =
          wish.status === "buy"
            ? "决定买下"
            : wish.status === "release"
              ? "轻轻放下"
              : ready
                ? "回信时间到了"
                : remaining >= 60
                  ? `还需 ${Math.floor(remaining / 60)} 小时 ${remaining % 60} 分`
                  : `还需 ${remaining} 分钟`;
        const linked = remainingForWish(state, wish.id);
        return `<article class="wish-card ${ready ? "ready" : ""}"><div class="wish-head"><div><h3>${escape(wish.title)}</h3><span class="tag">${label}</span></div><strong>${money(wish.amount_fen)}</strong></div><p class="wish-meta">${date(wish.created_at)} 寄出 · ${date(wish.ready_at)} 可以回信</p>${wish.note ? `<p class="wish-note">${escape(wish.note)}</p>` : ""}<div class="wish-foot"><p>${wish.status === "release" ? "放下的消费意向，不计作实际存入。" : wish.status === "buy" ? "你认真想过，这份喜欢值得。" : ready ? "昨天的心动，今天还在吗？" : "明天仍然喜欢，再买也来得及。"}</p>${ready ? `<button class="primary" data-resolve="${wish.id}">给自己回信 ↗</button>` : wish.status === "release" && linked > 0 ? `<button class="secondary" data-deposit="${wish.id}">记一笔存入</button>` : ""}</div></article>`;
      })
      .join("") ||
    `<div class="empty"><span class="empty-symbol">${filter === "ready" ? "✉" : "⌁"}</span><h3>${filter === "ready" ? "还没有到回信时间的愿望" : filter === "archive" ? "给每一个决定，留一页空白" : "这里可以，先收好一点喜欢"}</h3><p>${filter === "waiting" ? "寄出一个愿望，让它慢慢抵达明天。" : "你的选择会安静地留在这里。"}</p></div>`;
  $("#wish-list")
    .querySelectorAll("[data-resolve]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        activeWish = button.dataset.resolve;
        const wish = state.wishes.find((item) => item.id === activeWish);
        $("#resolve-title").textContent = wish.title;
        $("#resolve-description").textContent =
          `${money(wish.amount_fen)} 的心动，已经等过一段时间了。`;
        $("#resolve-form").reset();
        openDialog("#resolve-dialog");
      }),
    );
  $("#wish-list")
    .querySelectorAll("[data-deposit]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openDeposit(button.dataset.deposit),
      ),
    );
  $("#deposit-list").innerHTML =
    state.deposits
      .toReversed()
      .map((deposit) => {
        const wish = state.wishes.find((item) => item.id === deposit.wish_id);
        return `<article class="deposit-row ${deposit.reversed ? "reversed" : ""}"><strong>${deposit.reversed ? "− " : ""}${money(deposit.amount_fen)}</strong><div class="deposit-copy"><h3>${escape(deposit.note || "给更期待的事，记下一小步")}</h3><p>${date(deposit.at)} · ${wish ? `关联“${escape(wish.title)}”` : "独立手动记录"} · ${deposit.reversed ? "已更正撤销" : "未经平台核验"}</p></div>${deposit.reversed ? '<span class="tiny">原记录保留</span>' : `<button class="secondary" data-reverse="${deposit.id}">撤销这笔记录</button>`}</article>`;
      })
      .join("") ||
    '<p class="journal-empty">还没有手动存入记录。放下愿望后，可以自行完成存入，再回来记一笔。</p>';
  $("#deposit-list")
    .querySelectorAll("[data-reverse]")
    .forEach((button) =>
      button.addEventListener("click", async () => {
        try {
          await commit(
            event("reverse", { deposit_id: button.dataset.reverse }),
          );
          notice("这笔手动记录已撤销，原记录仍留在更正日记中。");
          $("#journal-title").focus();
        } catch (error) {
          notice(error.message, true);
        }
      }),
    );
  if (restoreAttribute && !focused.isConnected) {
    document
      .querySelector(`[${restoreAttribute}="${restoreValue}"]`)
      ?.focus({ preventScroll: true });
  }
}
function openDeposit(wishId = null) {
  depositWish = wishId;
  $("#deposit-form").reset();
  if (wishId) {
    const wish = state.wishes.find((item) => item.id === wishId);
    $("#deposit-description").textContent =
      `关联“${wish.title}”。最多可再关联 ${money(remainingForWish(state, wishId))}，请只记录你已自行存入的金额。`;
    $("#deposit-form").elements.amount.value = (
      remainingForWish(state, wishId) / 100
    ).toFixed(2);
  } else
    $("#deposit-description").textContent =
      "请确认你已自行完成存入。这里仅记日记，不核验账户。";
  openDialog("#deposit-dialog");
}
$("#add-open").addEventListener("click", () => {
  $("#wish-form").reset();
  openDialog("#wish-dialog");
});
$("#deposit-open").addEventListener("click", () => openDeposit());
$("#goal-edit").addEventListener("click", () => {
  const form = $("#goal-form");
  form.elements.name.value = state.goal.name;
  form.elements.amount.value = (state.goal.target_fen / 100).toFixed(2);
  openDialog("#goal-dialog");
});
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    render();
    document.querySelector(`[data-filter="${filter}"]`).focus();
  }),
);
$("#wish-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    await commit(
      event("wish", {
        title: form.elements.title.value,
        amount_fen: parseMoney(form.elements.amount.value),
        cooldown_hours: Number(form.elements.cooldown.value),
      }),
    );
    filter = "waiting";
    render();
    $("#wish-dialog").close();
    notice("愿望已收妥。等一段时间，再听听自己的回信。");
  } catch (error) {
    showError(form, error);
  }
});
$("#resolve-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    await commit(
      event("resolve", {
        wish_id: activeWish,
        choice: e.submitter.value,
        note: form.elements.note.value,
      }),
    );
    filter = "archive";
    render();
    $("#resolve-dialog").close();
    notice("你的决定已记下。消费意向与手动存入会分别统计。");
    $("#wishes-title").focus();
  } catch (error) {
    showError(form, error);
  }
});
$("#deposit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    await commit(
      event("deposit", {
        wish_id: depositWish,
        amount_fen: parseMoney(form.elements.amount.value),
        note: form.elements.note.value,
      }),
    );
    $("#deposit-dialog").close();
    notice("手动存入日记已更新；这条记录没有触发任何转账。");
  } catch (error) {
    showError(form, error);
  }
});
$("#goal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    await commit(
      event("goal", {
        name: form.elements.name.value,
        target_fen: parseMoney(form.elements.amount.value),
      }),
    );
    $("#goal-dialog").close();
    notice("更期待的方向，已经记好了。");
  } catch (error) {
    showError(form, error);
  }
});
function replacement(next) {
  pendingReplacement = next;
  if (journal.events.length) openDialog("#replace-dialog");
  else replace();
}
async function replace() {
  try {
    replay(pendingReplacement);
    const backend = await save(pendingReplacement);
    journal = structuredClone(pendingReplacement);
    state = replay(journal);
    pendingReplacement = null;
    filter = "waiting";
    storageLabel(backend);
    render();
    $("#replace-dialog").close();
    notice(
      backend === "memory"
        ? "记录仅在本页，请导出备份。"
        : "本机记录已替换。演示数据为虚构，未发生转账。",
      backend === "memory",
    );
  } catch (error) {
    notice(error.message, true);
  }
}
$("#demo-open").addEventListener("click", () => replacement(demoJournal()));
$("#replace-confirm").addEventListener("click", replace);
$("#export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(journal, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "pocket-pause-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice("备份已下载。请自己保管这份消费与日记记录。");
});
$("#import-open").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1000000) throw Error("备份超过 1 MB，未导入。");
    replacement(parseBackup(await file.text()));
  } catch (error) {
    notice(error.message, true);
  } finally {
    e.target.value = "";
  }
});
try {
  const loaded = await load();
  if (loaded.journal) {
    try {
      state = replay(loaded.journal);
      journal = loaded.journal;
    } catch {
      notice("本机记录格式不兼容，已用空白日记打开。可导入有效备份。", true);
    }
  }
  storageLabel(loaded.backend);
} catch {
  storageLabel("memory");
  notice("浏览器未能读取本机记录。当前页可以使用，请及时导出备份。", true);
}
render();
setInterval(() => {
  if (!document.querySelector("dialog[open]")) render();
}, 60000);
for (const id of ["wishes-title", "journal-title"]) $("#" + id).tabIndex = -1;
