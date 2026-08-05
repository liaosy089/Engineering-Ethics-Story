// ============================================================
// 誠信抉擇（文字版）- 遊戲主控
// 沒有地圖走動：靠底部按鈕在「地點」之間移動、觸發對話。
// ============================================================

let state = null;

// 兩個案件的通關進度（存在 localStorage，重新整理、關掉分頁再回來都還在）。
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem("cs_progress")) || {};
  } catch (e) {
    return {};
  }
}
function saveProgress() {
  try {
    localStorage.setItem("cs_progress", JSON.stringify(progress));
  } catch (e) {}
}
let progress = loadProgress();

// ---------------- 效果輔助函式（供 data.js 對話節點呼叫）----------------
// 這幾個函式名稱與行為完全對應正版 RPG 的 game.js，因為 data.js 的對話效果是共用的。

function addIntegrity(s, delta) {
  s.integrity = Math.max(0, Math.min(100, s.integrity + delta));
}
function addItem(s, itemId) {
  if (!s.items.includes(itemId)) s.items.push(itemId);
}
function advanceQuestTo(s, stepId) {
  const steps = CASES[s.caseId].questSteps;
  const idx = steps.findIndex((q) => q.id === stepId);
  if (idx > s.quest.stepIndex) s.quest.stepIndex = idx;
}
function triggerEnding(s) {
  if (s.caseId === "case1") {
    if (s.flags.giftOffered && !s.flags.giftRegistered) {
      addIntegrity(s, -25);
      s.flags.giftUnregisteredPenalty = true;
    }
    s.ended = true;
    s.endingKey = computeEndingKey(s);
  } else {
    if (s.flags.vendorInvited && !s.flags.inviteRegistered) {
      addIntegrity(s, -25);
      s.flags.inviteUnregisteredPenalty = true;
    }
    s.ended = true;
    s.endingKey = computeEndingKey2(s);
  }
}

// ---------------- 初始化 / 地點切換 ----------------

function initState(caseId) {
  state = {
    caseId,
    currentHub: "office",
    integrity: 70,
    flags: {},
    items: [],
    quest: { stepIndex: 0 },
    dialogue: null,
    ended: false,
    endingKey: null,
  };
}

function resolveExitTarget() {
  const hub = HUBS[state.currentHub];
  return hub.exitTarget === "case_field" ? CASES[state.caseId].fieldMap : hub.exitTarget;
}

function goToHub(hubId) {
  state.currentHub = hubId;

  const steps = CASES[state.caseId].questSteps;
  const fieldMapId = CASES[state.caseId].fieldMap;
  if (hubId === fieldMapId && !state.flags.enteredField) {
    state.flags.enteredField = true;
    advanceQuestTo(state, steps[2].id);
  }
  if (hubId === "office" && state.flags.enteredField) {
    advanceQuestTo(state, steps[3].id);
  }

  renderHub();
  updateAllUI();
}

// ---------------- 地點畫面 ----------------

function updateBackground(hubId) {
  document.getElementById("bg-layer").style.backgroundImage = `url("${HUBS[hubId].background}")`;
}

function renderHub() {
  document.getElementById("dialogue-view").classList.add("hidden");
  document.getElementById("hub-view").classList.remove("hidden");

  const hub = HUBS[state.currentHub];
  document.getElementById("locationName").textContent = hub.label;
  updateBackground(state.currentHub);

  const box = document.getElementById("hubActions");
  box.innerHTML = "";
  hub.actions.forEach((a) => {
    const btn = document.createElement("button");
    btn.className = "hub-btn";
    const portraitSrc = !a.isObject && PORTRAITS[a.id];
    if (portraitSrc) {
      const img = document.createElement("img");
      img.className = "hub-btn-portrait";
      img.src = portraitSrc;
      img.alt = "";
      img.onerror = () => { img.style.display = "none"; };
      btn.appendChild(img);
    } else {
      const iconSpan = document.createElement("span");
      iconSpan.className = "hub-btn-icon";
      iconSpan.textContent = a.icon || "❔";
      btn.appendChild(iconSpan);
    }
    const label = document.createElement("span");
    label.className = "hub-btn-label";
    label.textContent = a.label;
    btn.appendChild(label);
    btn.onclick = () => openDialogue(a.id);
    box.appendChild(btn);
  });

  const exitBtn = document.getElementById("hubExitBtn");
  exitBtn.textContent = hub.exitLabel;
  exitBtn.onclick = () => {
    const fieldMapId = CASES[state.caseId].fieldMap;
    const evidenceFlag = FIELD_EVIDENCE_FLAG[state.caseId];
    if (state.currentHub === fieldMapId && !state.flags[evidenceFlag]) {
      showConfirm(
        "你好像還沒有仔細調查現場、找大家聊聊，確定要先回去嗎？",
        () => goToHub(resolveExitTarget())
      );
      return;
    }
    goToHub(resolveExitTarget());
  };
}

// 離開案件現場前，如果還沒找到關鍵證據，先提醒一下，避免不小心按到「返回」
// 就被系統當成「沒調查、直接結案」處理（跳到科長那邊的盲目結案分支）。
const FIELD_EVIDENCE_FLAG = { case1: "foundEvidence", case2: "foundSpecEvidence" };

function showConfirm(message, onConfirm) {
  document.getElementById("confirmText").textContent = message;
  document.getElementById("confirm-overlay").classList.remove("hidden");
  document.getElementById("confirmOkBtn").onclick = () => {
    document.getElementById("confirm-overlay").classList.add("hidden");
    onConfirm();
  };
  document.getElementById("confirmCancelBtn").onclick = () => {
    document.getElementById("confirm-overlay").classList.add("hidden");
  };
}

// ---------------- 對話系統 ----------------

function currentNode() {
  return DIALOGUES[state.dialogue.npcId].nodes[state.dialogue.nodeId];
}

function openDialogue(npcId) {
  const tree = DIALOGUES[npcId];
  const startId = typeof tree.start === "function" ? tree.start(state) : tree.start;
  state.dialogue = { npcId, nodeId: startId };
  document.getElementById("hub-view").classList.add("hidden");
  document.getElementById("dialogue-view").classList.remove("hidden");
  renderDialogueNode();
}

function setPortrait(imgEl, portraitId) {
  const src = portraitId && PORTRAITS[portraitId];
  if (!src) {
    imgEl.classList.add("hidden");
    imgEl.removeAttribute("src");
    return;
  }
  imgEl.onerror = () => imgEl.classList.add("hidden");
  imgEl.src = src;
  imgEl.classList.remove("hidden");
}

function renderDialogueNode() {
  const node = currentNode();
  if (node.onEnter) node.onEnter(state);
  updateAllUI();

  document.getElementById("dialogueSpeaker").textContent = node.speaker;
  document.getElementById("dialogueText").textContent = node.text;
  setPortrait(document.getElementById("dialoguePortrait"), node.portraitOverride || state.dialogue.npcId);

  const choicesBox = document.getElementById("dialogueChoices");
  choicesBox.innerHTML = "";
  const continueEl = document.getElementById("dialogueContinue");

  if (node.choices && node.choices.length) {
    continueEl.classList.add("hidden");
    node.choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = choice.label;
      btn.onclick = () => selectChoice(choice);
      choicesBox.appendChild(btn);
    });
  } else {
    continueEl.classList.remove("hidden");
    continueEl.onclick = handleDialogueAdvance;
  }
}

function selectChoice(choice) {
  if (choice.effects) choice.effects(state);
  updateAllUI();
  if (state.ended) {
    closeDialogueForEnding();
    return;
  }
  if (choice.next) {
    state.dialogue.nodeId = choice.next;
    renderDialogueNode();
  } else {
    closeDialogue();
  }
}

function handleDialogueAdvance() {
  if (!state.dialogue) return;
  const node = currentNode();
  if (node.choices && node.choices.length) return;
  if (node.next) {
    state.dialogue.nodeId = node.next;
    renderDialogueNode();
  } else if (state.ended) {
    closeDialogueForEnding();
  } else {
    closeDialogue();
  }
}

function closeDialogue() {
  state.dialogue = null;
  renderHub();
}

function closeDialogueForEnding() {
  state.dialogue = null;
  showEnding();
}

function showEnding() {
  const isCase1 = state.caseId === "case1";
  const info = (isCase1 ? ENDINGS : ENDINGS2)[state.endingKey];
  const note = isCase1 ? getGiftRegistrationNote(state) : getInviteRegistrationNote(state);
  document.getElementById("endingTitle").textContent = info.title;
  document.getElementById("endingText").textContent = info.text + note;
  document.getElementById("endingScore").textContent = `最終誠信度：${state.integrity} / 100`;

  progress[state.caseId] = { endingKey: state.endingKey, integrity: state.integrity };
  saveProgress();

  const remaining = Object.keys(CASES).find((id) => !progress[id]);
  const continueBlock = document.getElementById("continue-block");
  const certSection = document.getElementById("cert-section");

  if (remaining) {
    continueBlock.classList.remove("hidden");
    certSection.classList.add("hidden");
    document.getElementById("continueText").textContent =
      `太好了，這個案件完成了！還有「${CASES[remaining].title}」沒玩過，兩個案件都完成才能登記兌獎喔。`;
    const continueBtn = document.getElementById("continueBtn");
    continueBtn.textContent = `繼續挑戰：${CASES[remaining].title} →`;
    continueBtn.onclick = () => {
      document.getElementById("ending-overlay").classList.add("hidden");
      startGame(remaining);
    };
  } else {
    continueBlock.classList.add("hidden");
    resetCertUI();
    certSection.classList.remove("hidden");
  }

  document.getElementById("ending-overlay").classList.remove("hidden");
}

// ---------------- 兌獎登記（完成證明 + Google 表單）----------------
// 這段的做法跟反賄選那款遊戲一樣：先在本機產生一張「完成證明」卡片，
// 同仁隨時可以截圖去政風室兌獎；願意留信箱的話，才會多送出一次登記。
//
// ★ 設定區：填完成績登記用的 Google 表單資訊
// 1. 建立一份新的 Google 表單，依序新增這 8 個「簡答」題目：
//      姓名或暱稱 / 電子郵件 / 完成日期 / 案件一結局 / 案件一誠信度 /
//      案件二結局 / 案件二誠信度 / 任務代號
// 2. 取得表單的 formResponse 網址與各題的 entry ID，填入下方
//    （跟反賄選那款遊戲設定 SUBMIT_CONFIG 的方式一樣）。
// 3. FORM_ACTION 留空的話，登記功能會自動隱藏，遊戲照常運作，
//    同仁還是可以截圖「完成證明」卡片去兌獎。
const SUBMIT_CONFIG = {
  FORM_ACTION: "https://docs.google.com/forms/d/e/1FAIpQLSfrEg4U89IHuuy8ZCq9OwqzOLKrQzHOpbNg75FAyZP_rOa0AA/formResponse",
  FIELDS: {
    name: "entry.20416040", // 姓名或暱稱
    email: "entry.526894555", // 電子郵件
    date: "entry.1804918415", // 完成日期
    case1Ending: "entry.2123688083", // 案件一結局
    case1Integrity: "entry.2049931210", // 案件一誠信度
    case2Ending: "entry.1809226427", // 案件二結局
    case2Integrity: "entry.1347765137", // 案件二誠信度
    code: "entry.972049163", // 任務代號
  },
};

function submitConfigured() {
  return !!(SUBMIT_CONFIG.FORM_ACTION && SUBMIT_CONFIG.FIELDS.email);
}

function simpleCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase().slice(0, 6);
}

let lastCertData = null;
let certSubmitted = false;

function setCertStatus(msg, kind) {
  const el = document.getElementById("certStatus");
  el.textContent = msg;
  el.className = "cert-status" + (kind ? " " + kind : "");
}

function resetCertUI() {
  document.getElementById("certCard").classList.add("hidden");
  document.getElementById("certNameInput").value = "";
  document.getElementById("certSubmitBlock").classList.add("hidden");
  document.getElementById("certEmailInput").value = "";
  document.getElementById("certEmailInput").disabled = false;
  document.getElementById("certSubmitBtn").disabled = false;
  setCertStatus("", "");
  lastCertData = null;
  certSubmitted = false;
}

function generateCert() {
  const name = document.getElementById("certNameInput").value.trim() || "匿名同仁";
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
  const c1 = progress.case1;
  const c2 = progress.case2;
  const case1Ending = c1 ? `${ENDINGS[c1.endingKey].title}（${c1.integrity}分）` : "—";
  const case2Ending = c2 ? `${ENDINGS2[c2.endingKey].title}（${c2.integrity}分）` : "—";
  const code = "CS-" + simpleCode(name + dateStr + (c1 ? c1.endingKey : "") + (c2 ? c2.endingKey : ""));

  document.getElementById("certName").textContent = name;
  document.getElementById("certDate").textContent = dateStr;
  document.getElementById("certCase1").textContent = case1Ending;
  document.getElementById("certCase2").textContent = case2Ending;
  document.getElementById("certCode").textContent = "任務代號：" + code;
  document.getElementById("certCard").classList.remove("hidden");

  lastCertData = {
    name,
    date: dateStr,
    case1Ending,
    case1Integrity: c1 ? String(c1.integrity) : "",
    case2Ending,
    case2Integrity: c2 ? String(c2.integrity) : "",
    code,
  };

  if (submitConfigured() && !certSubmitted) {
    document.getElementById("certSubmitBlock").classList.remove("hidden");
  }
  document.getElementById("certCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function submitCert() {
  if (certSubmitted) return;
  if (!lastCertData) {
    setCertStatus("請先產生完成證明。", "err");
    return;
  }
  const email = document.getElementById("certEmailInput").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setCertStatus("請輸入正確的電子郵件格式。", "err");
    return;
  }
  document.getElementById("certSubmitBtn").disabled = true;
  setCertStatus("登記中…", "");

  const f = SUBMIT_CONFIG.FIELDS;
  const body = new URLSearchParams();
  if (f.name) body.append(f.name, lastCertData.name);
  if (f.email) body.append(f.email, email);
  if (f.date) body.append(f.date, lastCertData.date);
  if (f.case1Ending) body.append(f.case1Ending, lastCertData.case1Ending);
  if (f.case1Integrity) body.append(f.case1Integrity, lastCertData.case1Integrity);
  if (f.case2Ending) body.append(f.case2Ending, lastCertData.case2Ending);
  if (f.case2Integrity) body.append(f.case2Integrity, lastCertData.case2Integrity);
  if (f.code) body.append(f.code, lastCertData.code);

  // Google 表單不會回傳 CORS 允許標頭，所以讀不到回應內容；
  // 只要 fetch 沒有丟出錯誤，就當作送出成功（跟反賄選那款遊戲做法一樣）。
  fetch(SUBMIT_CONFIG.FORM_ACTION, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
    .then(() => {
      certSubmitted = true;
      setCertStatus("✅ 登記完成，感謝參與！請截圖上方完成證明至政風室兌獎。", "ok");
      document.getElementById("certEmailInput").disabled = true;
    })
    .catch((err) => {
      console.error("submit failed", err);
      document.getElementById("certSubmitBtn").disabled = false;
      setCertStatus("⚠️ 登記失敗，請確認網路後再試一次，或直接截圖完成證明兌獎。", "err");
    });
}

// 首頁進度顯示：如果之前已經完成過案件，讓同仁知道還差哪一案，
// 兩案都完成的話，直接給一個按鈕跳去兌獎登記，不用重玩一次。
function renderIntroProgress() {
  const box = document.getElementById("introProgress");
  const goBtn = document.getElementById("goToCertBtn");
  const clearBtn = document.getElementById("clearProgressBtn");
  const done1 = !!progress.case1;
  const done2 = !!progress.case2;
  if (!done1 && !done2) {
    box.classList.add("hidden");
    goBtn.classList.add("hidden");
    clearBtn.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.textContent = `目前進度：案件一 ${done1 ? "✅ 已完成" : "⬜ 未完成"} ／ 案件二 ${done2 ? "✅ 已完成" : "⬜ 未完成"}`;
  clearBtn.classList.remove("hidden");
  if (done1 && done2) {
    goBtn.classList.remove("hidden");
  } else {
    goBtn.classList.add("hidden");
  }
}

function showCertOnly() {
  document.getElementById("intro-overlay").classList.add("hidden");
  document.getElementById("endingTitle").textContent = "兌獎登記";
  document.getElementById("endingText").textContent = "你已經完成兩個案件了，可以直接在下面登記兌獎資料。";
  document.getElementById("endingScore").textContent = "";
  document.getElementById("continue-block").classList.add("hidden");
  resetCertUI();
  document.getElementById("cert-section").classList.remove("hidden");
  document.getElementById("ending-overlay").classList.remove("hidden");
}

// ---------------- UI 更新 ----------------

function updateStatusUI() {
  const bar = document.getElementById("integrityBarMini");
  bar.style.width = state.integrity + "%";
  bar.style.background =
    state.integrity >= 70
      ? "linear-gradient(90deg,#52d17c,#2fae5b)"
      : state.integrity >= 40
      ? "linear-gradient(90deg,#f2c94c,#e0a23b)"
      : "linear-gradient(90deg,#ff6b6b,#c23b3b)";
  document.getElementById("integrityValueMini").textContent = state.integrity;
}

function updateQuestUI() {
  const q = CASES[state.caseId].questSteps[state.quest.stepIndex];
  document.getElementById("questTitle").textContent = q.title;
  document.getElementById("questDesc").textContent = q.desc;
}

function updateInventoryUI() {
  const strip = document.getElementById("inventory-strip");
  strip.innerHTML = "";
  if (state.items.length === 0) {
    strip.classList.add("hidden");
    return;
  }
  strip.classList.remove("hidden");
  for (const id of state.items) {
    const div = document.createElement("div");
    div.className = "inv-icon";
    div.title = ITEM_NAMES[id] || id;
    div.textContent = ITEM_ICONS[id] || "❔";
    strip.appendChild(div);
  }
}

function updateAllUI() {
  updateStatusUI();
  updateQuestUI();
  updateInventoryUI();
}

// ---------------- 啟動 ----------------

function startGame(caseId) {
  initState(caseId);
  document.getElementById("intro-overlay").classList.add("hidden");
  renderHub();
  updateAllUI();
}

document.querySelectorAll(".case-btn").forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.case));
});
document.getElementById("goToCertBtn").addEventListener("click", showCertOnly);
document.getElementById("certGenerateBtn").addEventListener("click", generateCert);
document.getElementById("certSubmitBtn").addEventListener("click", submitCert);

// 「返回選案畫面」不會清掉已經破關的紀錄——只是帶你回去選案件，
// 避免像之前那樣：破完一案想接著玩另一案，結果不小心把已經完成的那案也洗掉。
document.getElementById("restartBtn").addEventListener("click", () => {
  document.getElementById("ending-overlay").classList.add("hidden");
  document.getElementById("intro-overlay").classList.remove("hidden");
  renderIntroProgress();
});

// 真的要清空紀錄（例如同一台電腦換下一位同仁玩），才走這個次要的小連結，
// 而且要再次確認，不會被誤觸。
document.getElementById("clearProgressBtn").addEventListener("click", () => {
  showConfirm("確定要清除目前的破關紀錄嗎？案件一、案件二的完成狀態都會被清空，這個動作沒辦法復原。", () => {
    progress = {};
    saveProgress();
    renderIntroProgress();
  });
});

renderIntroProgress();
