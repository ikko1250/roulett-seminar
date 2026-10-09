const DEFAULT_ITEMS = ["A", "B", "C", "D", "E", "F"];
const STORAGE_KEY = "roulette-items";
const REMOVE_WINNER_KEY = "roulette-remove-winner";
const DISABLED_KEY = "roulette-disabled";
const DOUBLE_KEY = "roulette-double";
const COLOR_KEY = "roulette-colors";

// パステル調のパレット。先頭6色は temp/index.html のデザインに合わせている
const PALETTE = [
  "#F1B9C3", // ピンク
  "#F4CBA2", // アプリコット
  "#F3E6A9", // バター
  "#BCDFCB", // ミント
  "#A9D9DD", // アクア
  "#BDC9EE", // ペリウィンクル
  "#D5C6F0", // ラベンダー
  "#E5D5BF", // ベージュ
  "#D6E4AE", // ライム
  "#EDC3DD", // ローズ
];
const TEXT_COLOR = "#383544";
const MIN_LABEL_FONT = 10; // ルーレットの文字の最小サイズ (px)
const SPIN_DURATION = 2500; // ms
const REDUCED_SPIN_DURATION = 80; // 動きを減らす設定のときの回転時間 (ms)
const REMOVE_DELAY = 600; // 結果を見せてから候補を外すまでの待ち時間 (ms)
const MIN_TURNS = 5;

const $ = (id) => document.getElementById(id);
const canvas = $("r-wheel");
const ctx = canvas.getContext("2d");
const spinBtn = $("r-spin");
const spinLabelEl = $("r-spin-label");
const resultEl = $("r-result");
const resultNoteEl = $("r-result-note");
const rowsEl = $("r-rows");
const countEl = $("r-count");
const headerCountEl = $("r-header-count");
const inputCountEl = $("r-input-count");
const textEl = $("r-text");
const errorEl = $("r-error");
const fileEl = $("r-file");
const importBtn = $("r-import");
const removeWinnerEl = $("r-remove");
const enableAllBtn = $("r-enable-all");
const resetBtn = $("r-reset");
const settingsFields = $("r-settings-fields");
const inputFields = $("r-input-fields");
const drawTab = $("r-draw-tab");
const inputTab = $("r-input-tab");
const drawPanel = $("r-draw-panel");
const inputPanel = $("r-input-panel");
const tabs = [drawTab, inputTab];

let rotation = 0; // ラジアン。ホイール全体の回転角
let busy = false; // 回転中、または当選項目を外すまでの待ち時間中
let disabled = new Set(); // 一時的に外している項目名
let doubled = new Set(); // 確率2倍の項目名
let colorMap = {}; // 項目名 → PALETTE の番号。一度決めた色は変えない

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    // localStorage が使えない環境では保存なしで動作する
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // 保存できなくても動作は継続
  }
}

function loadState() {
  const saved = storageGet(STORAGE_KEY);
  textEl.value = saved !== null ? saved : DEFAULT_ITEMS.join("\n");

  removeWinnerEl.checked = storageGet(REMOVE_WINNER_KEY) === "1";
  disabled = loadSet(DISABLED_KEY);
  doubled = loadSet(DOUBLE_KEY);

  try {
    const parsed = JSON.parse(storageGet(COLOR_KEY));
    if (parsed && typeof parsed === "object") colorMap = parsed;
  } catch (e) {
    colorMap = {};
  }
}

function loadSet(key) {
  try {
    const parsed = JSON.parse(storageGet(key));
    if (Array.isArray(parsed)) return new Set(parsed.map(String));
  } catch (e) {
    // 壊れた値は無視する
  }
  return new Set();
}

function saveSets() {
  storageSet(DISABLED_KEY, JSON.stringify([...disabled]));
  storageSet(DOUBLE_KEY, JSON.stringify([...doubled]));
}

function clearSets() {
  disabled.clear();
  doubled.clear();
  saveSets();
  colorMap = {};
  storageSet(COLOR_KEY, "{}");
}

function saveItems() {
  storageSet(STORAGE_KEY, textEl.value);
}

function getItems() {
  return textEl.value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ルーレットに載せる項目。index は項目欄での位置、weight は当たりやすさ
function getEntries() {
  const items = getItems();
  assignColors(items);
  return items
    .map((label, index) => ({
      label,
      index,
      weight: doubled.has(label) ? 2 : 1,
      color: colorFor(label),
    }))
    .filter((e) => !disabled.has(e.label));
}

// まだ色のない項目に色を割り当てる。
// 前後の項目と違う色のうち、いま使われている数が最も少ない色を選ぶ
function assignColors(items) {
  let changed = false;
  items.forEach((label, i) => {
    if (colorMap[label] !== undefined) return;

    const counts = PALETTE.map(() => 0);
    items.forEach((other) => {
      if (colorMap[other] !== undefined) counts[colorMap[other]]++;
    });
    // ルーレットは円なので、先頭と末尾も隣どうしとして扱う
    const n = items.length;
    const neighbors = [items[(i - 1 + n) % n], items[(i + 1) % n]]
      .map((n) => colorMap[n])
      .filter((c) => c !== undefined);

    let best = 0;
    let bestCount = Infinity;
    PALETTE.forEach((_, c) => {
      if (neighbors.includes(c)) return;
      if (counts[c] < bestCount) {
        best = c;
        bestCount = counts[c];
      }
    });
    colorMap[label] = best;
    changed = true;
  });
  if (changed) storageSet(COLOR_KEY, JSON.stringify(colorMap));
}

function colorFor(label) {
  return PALETTE[colorMap[label] % PALETTE.length] || PALETTE[0];
}

function setBusy(value) {
  busy = value;
  settingsFields.disabled = value;
  inputFields.disabled = value;
  tabs.forEach((tab) => (tab.disabled = value));
  updateSpinButton();
}

function updateSpinButton() {
  spinBtn.disabled = busy || getEntries().length === 0;
}

function resetResult() {
  resultEl.textContent = "—";
  resultNoteEl.textContent = "";
  spinLabelEl.textContent = "回す";
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

// ---- タブ ----

function switchPanel(panel) {
  if (busy) return;
  const drawing = panel === "draw";
  drawPanel.hidden = !drawing;
  inputPanel.hidden = drawing;
  drawTab.setAttribute("aria-selected", String(drawing));
  inputTab.setAttribute("aria-selected", String(!drawing));
  drawTab.tabIndex = drawing ? 0 : -1;
  inputTab.tabIndex = drawing ? -1 : 0;
  // 非表示の間にサイズが変わっている可能性があるので描き直す
  if (drawing) {
    setupCanvas();
    draw();
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => switchPanel(index === 0 ? "draw" : "input"));
  tab.addEventListener("keydown", (e) => {
    if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - index;
    switchPanel(next === 0 ? "draw" : "input");
    tabs[next].focus();
  });
});

// ---- 候補リスト ----

function renderList() {
  const items = getItems();
  const entries = getEntries();
  const total = entries.reduce((sum, e) => sum + e.weight, 0);

  countEl.textContent = `${entries.length}件`;
  headerCountEl.textContent = `${entries.length}件の候補`;
  inputCountEl.textContent = `${items.length}件`;
  updateSpinButton();

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "r-rows-empty";
    empty.textContent = "「項目入力」タブで項目を入力してください";
    rowsEl.replaceChildren(empty);
    return;
  }

  rowsEl.replaceChildren(
    ...items.map((label) => {
      const on = !disabled.has(label);
      const weight = doubled.has(label) ? 2 : 1;

      const row = document.createElement("div");
      row.className = "r-row" + (on ? "" : " is-off");

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = on;
      check.setAttribute("aria-label", `${label}を抽選に含める`);
      check.addEventListener("change", () => {
        if (check.checked) disabled.delete(label);
        else disabled.add(label);
        onSettingsChange();
      });

      const nameWrap = document.createElement("div");
      nameWrap.className = "r-name-wrap";
      const swatch = document.createElement("span");
      swatch.className = "r-swatch";
      swatch.style.background = colorFor(label);
      const name = document.createElement("span");
      name.className = "r-name";
      name.textContent = label;
      name.addEventListener("click", () => {
        if (!busy) check.click();
      });
      nameWrap.append(swatch, name);

      const weightBtn = document.createElement("button");
      weightBtn.type = "button";
      weightBtn.className = "r-weight";
      weightBtn.textContent = `${weight}倍`;
      weightBtn.setAttribute("aria-pressed", String(weight === 2));
      weightBtn.setAttribute("aria-label", `${label}の重みを1倍と2倍で切り替える`);
      weightBtn.addEventListener("click", () => {
        if (doubled.has(label)) doubled.delete(label);
        else doubled.add(label);
        onSettingsChange();
      });

      const prob = document.createElement("span");
      prob.className = "r-probability";
      prob.textContent = on && total > 0 ? `${((weight / total) * 100).toFixed(1)}%` : "—";

      row.append(check, nameWrap, weightBtn, prob);
      return row;
    })
  );
}

function onSettingsChange() {
  if (busy) return;
  saveSets();
  resetResult();
  renderList();
  draw();
}

// ---- ルーレット描画 ----

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  if (size === 0) return; // 非表示中
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  const entries = getEntries();
  const size = canvas.clientWidth;
  if (size === 0) return;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;

  ctx.clearRect(0, 0, size, size);
  canvas.setAttribute(
    "aria-label",
    entries.length === 0 ? "候補なし" : `${entries.length}つの候補のルーレット`
  );

  if (entries.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#eeecf5";
    ctx.fill();
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `${Math.max(12, size * 0.0375)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("候補を選択してください", cx, cy - radius * 0.42);
    return;
  }

  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let start = rotation;

  // 扇形
  const segments = entries.map(({ label, weight, color }) => {
    const seg = (Math.PI * 2 * weight) / total;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + seg);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (entries.length > 1) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    const mid = start + seg / 2;
    start += seg;
    return { label, seg, mid };
  });

  // 文字（回転させず水平に描く）
  const baseFont = size * 0.0575;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = TEXT_COLOR;
  segments.forEach(({ label, seg, mid }) => {
    // 候補が1つだけのときは、円全体を使って中心の少し上に描く
    const single = entries.length === 1;
    const r = radius * 0.65;
    const x = single ? cx : cx + r * Math.cos(mid);
    const y = single ? cy - radius * 0.42 : cy + r * Math.sin(mid);

    // 扇形に収まる幅と大きさを、文字の向き（水平）と扇形の向きから見積もる
    const arcLen = single ? radius * 2 : r * seg;
    const cos = Math.abs(Math.cos(mid));
    const sin = Math.abs(Math.sin(mid));
    const radialRoom = radius * 0.45;
    const maxWidth = single
      ? radius * 1.2
      : Math.min(
          radius * 0.6,
          cos > 0.01 ? radialRoom / cos : Infinity,
          sin > 0.01 ? (arcLen * 0.85) / sin : Infinity
        );
    // 収まらなければ最小サイズまで小さくし、それでも長ければ省略する
    let fontSize = Math.max(MIN_LABEL_FONT, Math.min(baseFont, arcLen * 0.5));
    setLabelFont(fontSize);
    const width = ctx.measureText(label).width;
    if (width > maxWidth) {
      fontSize = Math.max(MIN_LABEL_FONT, (fontSize * maxWidth) / width);
      setLabelFont(fontSize);
    }
    ctx.fillText(truncate(label, maxWidth), x, y);
  });
}

function setLabelFont(size) {
  ctx.font = `600 ${size}px Inter, "Noto Sans JP", sans-serif`;
}

function truncate(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  // 「…」だけになるほど狭いときは、せめて先頭の1文字を出す
  return t.length > 0 ? t + "…" : Array.from(text)[0];
}

// 針（真上 = -π/2）が指している項目
function entryAtPointer(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  const a = mod(-Math.PI / 2 - rotation, Math.PI * 2);
  let acc = 0;
  for (const e of entries) {
    acc += (Math.PI * 2 * e.weight) / total;
    if (a < acc) return e;
  }
  return entries[entries.length - 1];
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ---- 回転 ----

function spin() {
  const entries = getEntries();
  if (busy || entries.length === 0) return;

  setBusy(true);
  resultEl.textContent = "…";
  resultNoteEl.textContent = "";
  spinLabelEl.textContent = "抽選中…";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduced ? REDUCED_SPIN_DURATION : SPIN_DURATION;
  const startRotation = rotation;
  const delta = MIN_TURNS * Math.PI * 2 + Math.random() * Math.PI * 2;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    rotation = startRotation + delta * easeOutCubic(t);
    draw();

    if (t < 1) {
      requestAnimationFrame(frame);
      return;
    }

    rotation = mod(rotation, Math.PI * 2);
    const winner = entryAtPointer(entries).label;
    resultEl.textContent = winner;
    spinLabelEl.textContent = "もう一度回す";

    if (removeWinnerEl.checked) {
      // 結果を確認できるよう少し待ってから外す
      setTimeout(() => {
        disabled.add(winner);
        saveSets();
        resultNoteEl.textContent = "次回の候補から外しました";
        renderList();
        draw();
        setBusy(false);
      }, REMOVE_DELAY);
    } else {
      setBusy(false);
    }
  }

  requestAnimationFrame(frame);
}

// ---- 項目入力 ----

// テキストファイルを読み込む。UTF-8 として読めなければ Shift_JIS とみなす
async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (e) {
    text = new TextDecoder("shift_jis").decode(buffer);
  }
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

async function loadFile(file) {
  if (busy || !file) return;
  try {
    const text = await readTextFile(file);
    const items = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (items.length === 0) {
      showError("ファイルに項目がありませんでした。");
      return;
    }
    textEl.value = items.join("\n");
    saveItems();
    clearSets();
    showError("");
    resetResult();
    renderList();
    draw();
  } catch (e) {
    showError("ファイルを読み込めませんでした。");
  }
}

// ---- 初期化とイベント ----

loadState();
renderList();
setupCanvas();
draw();

spinBtn.addEventListener("click", spin);

textEl.addEventListener("input", () => {
  saveItems();
  showError("");
  resetResult();
  renderList();
  draw();
});

removeWinnerEl.addEventListener("change", () => {
  storageSet(REMOVE_WINNER_KEY, removeWinnerEl.checked ? "1" : "0");
});

enableAllBtn.addEventListener("click", () => {
  if (busy) return;
  disabled.clear();
  onSettingsChange();
});

resetBtn.addEventListener("click", () => {
  if (busy) return;
  textEl.value = DEFAULT_ITEMS.join("\n");
  saveItems();
  clearSets();
  showError("");
  resetResult();
  renderList();
  draw();
});

importBtn.addEventListener("click", () => fileEl.click());

fileEl.addEventListener("change", () => {
  loadFile(fileEl.files[0]);
  fileEl.value = ""; // 同じファイルを続けて選べるようにする
});

textEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  textEl.classList.add("dragover");
});

textEl.addEventListener("dragleave", () => {
  textEl.classList.remove("dragover");
});

textEl.addEventListener("drop", (e) => {
  e.preventDefault();
  textEl.classList.remove("dragover");
  loadFile(e.dataTransfer.files[0]);
});

window.addEventListener("resize", () => {
  setupCanvas();
  draw();
});
