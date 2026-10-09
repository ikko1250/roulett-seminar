const DEFAULT_ITEMS = ["A", "B", "C", "D", "E", "F"];
const STORAGE_KEY = "roulette-items";
const REMOVED_KEY = "roulette-removed";
const REMOVE_WINNER_KEY = "roulette-remove-winner";
const SPIN_DURATION = 5000; // ms
const REMOVE_DELAY = 1500; // 結果を見せてから候補を外すまでの待ち時間 (ms)
const MIN_TURNS = 5;

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin");
const resultEl = document.getElementById("result");
const itemsEl = document.getElementById("items");
const resetBtn = document.getElementById("reset");
const fileEl = document.getElementById("file");
const removeWinnerEl = document.getElementById("remove-winner");
const removedAreaEl = document.getElementById("removed-area");
const removedListEl = document.getElementById("removed-list");
const restoreBtn = document.getElementById("restore");

let rotation = 0; // ラジアン。ホイール全体の回転角
let busy = false; // 回転中、または当選項目を外すまでの待ち時間中
let removed = []; // 候補から外した項目（当たった順）

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
  itemsEl.value = saved !== null ? saved : DEFAULT_ITEMS.join("\n");

  try {
    const parsed = JSON.parse(storageGet(REMOVED_KEY));
    if (Array.isArray(parsed)) removed = parsed.map(String);
  } catch (e) {
    removed = [];
  }

  removeWinnerEl.checked = storageGet(REMOVE_WINNER_KEY) === "1";
}

function saveItems() {
  storageSet(STORAGE_KEY, itemsEl.value);
}

function saveRemoved() {
  storageSet(REMOVED_KEY, JSON.stringify(removed));
}

function getItems() {
  return itemsEl.value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function setItems(items) {
  itemsEl.value = items.join("\n");
  saveItems();
}

function setBusy(value) {
  busy = value;
  spinBtn.disabled = value;
  itemsEl.disabled = value;
  resetBtn.disabled = value;
  restoreBtn.disabled = value;
  fileEl.disabled = value;
}

function renderRemoved() {
  removedAreaEl.hidden = removed.length === 0;
  removedListEl.replaceChildren(
    ...removed.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    })
  );
}

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  const items = getItems();
  const size = canvas.clientWidth;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 8;

  ctx.clearRect(0, 0, size, size);

  if (items.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ddd";
    ctx.fill();
    ctx.fillStyle = "#666";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("項目を入力してください", cx, cy);
    return;
  }

  const seg = (Math.PI * 2) / items.length;
  const fontSize = Math.max(12, Math.min(24, size / 20));

  items.forEach((label, i) => {
    const start = rotation + i * seg;
    const end = start + seg;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = `hsl(${(i * 360) / items.length}, 70%, 60%)`;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // ラベル（扇形の中心線に沿って配置）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + seg / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 3;
    const maxWidth = radius * 0.7;
    ctx.fillText(truncate(label, maxWidth), radius - 16, 0);
    ctx.restore();
  });

  // 外枠と中心
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#333";
  ctx.fill();
}

function truncate(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

// 針（真上 = -π/2）が指している項目のインデックス
function indexAtPointer(count) {
  const seg = (Math.PI * 2) / count;
  const a = mod(-Math.PI / 2 - rotation, Math.PI * 2);
  return Math.floor(a / seg);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function spin() {
  const items = getItems();
  if (busy || items.length === 0) return;

  setBusy(true);
  resultEl.textContent = "";

  const startRotation = rotation;
  const delta = MIN_TURNS * Math.PI * 2 + Math.random() * Math.PI * 2;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min((now - startTime) / SPIN_DURATION, 1);
    rotation = startRotation + delta * easeOutCubic(t);
    draw();

    if (t < 1) {
      requestAnimationFrame(frame);
      return;
    }

    rotation = mod(rotation, Math.PI * 2);
    const winnerIndex = indexAtPointer(items.length);
    const winner = items[winnerIndex];
    resultEl.textContent = `結果：${winner}`;

    if (removeWinnerEl.checked) {
      // 結果を確認できるよう少し待ってから外す
      setTimeout(() => {
        setItems(items.filter((_, i) => i !== winnerIndex));
        removed.push(winner);
        saveRemoved();
        renderRemoved();
        draw();
        setBusy(false);
      }, REMOVE_DELAY);
    } else {
      setBusy(false);
    }
  }

  requestAnimationFrame(frame);
}

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
      alert("ファイルに項目がありませんでした。");
      return;
    }
    setItems(items);
    removed = [];
    saveRemoved();
    renderRemoved();
    resultEl.textContent = "";
    draw();
  } catch (e) {
    alert("ファイルを読み込めませんでした。");
  }
}

loadState();
renderRemoved();
setupCanvas();
draw();

spinBtn.addEventListener("click", spin);

itemsEl.addEventListener("input", () => {
  saveItems();
  resultEl.textContent = "";
  draw();
});

resetBtn.addEventListener("click", () => {
  if (busy) return;
  setItems(DEFAULT_ITEMS);
  removed = [];
  saveRemoved();
  renderRemoved();
  resultEl.textContent = "";
  draw();
});

restoreBtn.addEventListener("click", () => {
  if (busy) return;
  setItems([...getItems(), ...removed]);
  removed = [];
  saveRemoved();
  renderRemoved();
  resultEl.textContent = "";
  draw();
});

removeWinnerEl.addEventListener("change", () => {
  storageSet(REMOVE_WINNER_KEY, removeWinnerEl.checked ? "1" : "0");
});

fileEl.addEventListener("change", () => {
  loadFile(fileEl.files[0]);
  fileEl.value = ""; // 同じファイルを続けて選べるようにする
});

itemsEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  itemsEl.classList.add("dragover");
});

itemsEl.addEventListener("dragleave", () => {
  itemsEl.classList.remove("dragover");
});

itemsEl.addEventListener("drop", (e) => {
  e.preventDefault();
  itemsEl.classList.remove("dragover");
  loadFile(e.dataTransfer.files[0]);
});

window.addEventListener("resize", () => {
  setupCanvas();
  draw();
});
