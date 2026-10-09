const DEFAULT_ITEMS = ["A", "B", "C", "D", "E", "F"];
const STORAGE_KEY = "roulette-items";
const SPIN_DURATION = 5000; // ms
const MIN_TURNS = 5;

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin");
const resultEl = document.getElementById("result");
const itemsEl = document.getElementById("items");
const resetBtn = document.getElementById("reset");

let rotation = 0; // ラジアン。ホイール全体の回転角
let spinning = false;

function loadItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch (e) {
    // localStorage が使えない環境では初期値を使う
  }
  return DEFAULT_ITEMS.join("\n");
}

function saveItems(text) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (e) {
    // 保存できなくても動作は継続
  }
}

function getItems() {
  return itemsEl.value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
  if (spinning || items.length === 0) return;

  spinning = true;
  spinBtn.disabled = true;
  itemsEl.disabled = true;
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
    } else {
      rotation = mod(rotation, Math.PI * 2);
      const winner = items[indexAtPointer(items.length)];
      resultEl.textContent = `結果：${winner}`;
      spinning = false;
      spinBtn.disabled = false;
      itemsEl.disabled = false;
    }
  }

  requestAnimationFrame(frame);
}

itemsEl.value = loadItems();
setupCanvas();
draw();

spinBtn.addEventListener("click", spin);

itemsEl.addEventListener("input", () => {
  saveItems(itemsEl.value);
  resultEl.textContent = "";
  draw();
});

resetBtn.addEventListener("click", () => {
  if (spinning) return;
  itemsEl.value = DEFAULT_ITEMS.join("\n");
  saveItems(itemsEl.value);
  resultEl.textContent = "";
  draw();
});

window.addEventListener("resize", () => {
  setupCanvas();
  draw();
});
