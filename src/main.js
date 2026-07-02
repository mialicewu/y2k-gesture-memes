import "./style.css";
import { FilesetResolver, HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import { detectGesture, GESTURE_LABELS } from "./gestures.js";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const FACE_MESH = [
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314],
  [314, 405], [405, 321], [321, 375], [375, 291], [291, 409], [409, 270],
  [270, 269], [269, 267], [267, 0], [0, 37], [37, 39], [39, 40],
  [40, 185], [185, 61],
  [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317],
  [317, 402], [402, 318], [318, 324], [324, 308], [308, 415], [415, 310],
  [310, 311], [311, 312], [312, 13], [13, 82], [82, 81], [81, 80],
  [80, 78],
];

let handLandmarker = null;
let faceLandmarker = null;
let memeCatalog = {};
let currentGesture = null;
let stableGesture = null;
let stableCount = 0;
const STABLE_FRAMES = 8;

const state = {
  running: false,
  showOverlay: true,
};

function buildUI() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="desktop">
      <aside class="desktop-icons">
        <button class="desktop-icon" type="button" data-action="webcam">
          <span class="icon icon-webcam"></span>
          <span>Webcam</span>
        </button>
        <button class="desktop-icon" type="button" data-action="memes">
          <span class="icon icon-memes"></span>
          <span>Memes</span>
        </button>
        <button class="desktop-icon" type="button" data-action="help">
          <span class="icon icon-help"></span>
          <span>Help</span>
        </button>
        <button class="desktop-icon" type="button" data-action="recycle">
          <span class="icon icon-recycle"></span>
          <span>Recycle Bin</span>
        </button>
      </aside>

      <main class="desktop-windows">
        <div class="window webcam-window" id="webcam-window">
          <div class="title-bar">
            <div class="title-bar-text">
              <span class="title-icon title-icon-webcam"></span>
              Webcam
            </div>
            <div class="title-bar-controls">
              <button aria-label="Minimize"></button>
              <button aria-label="Maximize"></button>
              <button aria-label="Close"></button>
            </div>
          </div>
          <div class="window-body webcam-body">
            <div class="video-shell">
              <video id="video" playsinline muted autoplay></video>
              <canvas id="overlay"></canvas>
              <div class="gesture-badge" id="gesture-badge">Waiting for camera…</div>
              <div class="scanlines"></div>
            </div>
            <fieldset class="controls-fieldset">
              <legend>Controls</legend>
              <div class="field-row">
                <button id="start-btn" type="button">Start Camera</button>
                <button id="overlay-btn" type="button">Hide Overlay</button>
              </div>
              <p class="hint">Allow camera access, then strike a pose. Matching memes appear below.</p>
            </fieldset>
          </div>
          <div class="status-bar">
            <p class="status-bar-field">Live</p>
            <p class="status-bar-field" id="fps-label">0 FPS</p>
          </div>
        </div>

        <div class="window memes-window" id="memes-window">
          <div class="title-bar">
            <div class="title-bar-text">
              <span class="title-icon title-icon-memes"></span>
              Memes
            </div>
            <div class="title-bar-controls">
              <button aria-label="Minimize"></button>
              <button aria-label="Maximize"></button>
              <button aria-label="Close"></button>
            </div>
          </div>
          <div class="window-body meme-body">
            <div class="sticker-frame">
              <img id="meme-image" alt="Matching reaction meme" />
              <div class="sticker-shadow"></div>
            </div>
            <p class="meme-caption" id="meme-caption">Make a gesture to summon a sticker ✨</p>
          </div>
        </div>

        <div class="window help-window hidden" id="help-window">
          <div class="title-bar">
            <div class="title-bar-text">Help — Gesture Guide</div>
            <div class="title-bar-controls">
              <button aria-label="Close" data-close="help-window"></button>
            </div>
          </div>
          <div class="window-body help-body">
            <ul class="gesture-list" id="gesture-list"></ul>
            <p class="hint">Drop your own images into <code>public/memes/</code> and edit <code>memes.json</code>.</p>
          </div>
        </div>
      </main>

      <footer class="taskbar">
        <button class="start-button" type="button">
          <span class="start-logo"></span>
          Start
        </button>
        <div class="taskbar-tabs">
          <button class="task-tab active" type="button">Webcam Diary.exe</button>
        </div>
        <div class="taskbar-clock" id="clock">12:00 PM</div>
      </footer>
    </div>
  `;
}

function updateClock() {
  const clock = document.getElementById("clock");
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function populateHelp() {
  const list = document.getElementById("gesture-list");
  if (!list) return;
  list.innerHTML = Object.entries(GESTURE_LABELS)
    .map(([key, label]) => `<li><strong>${label}</strong> — try it in front of the camera</li>`)
    .join("");
}

async function loadMemes() {
  const res = await fetch("/memes/memes.json");
  memeCatalog = await res.json();
}

function getMemePath(gesture) {
  const entry = memeCatalog[gesture];
  if (!entry?.images?.length) return null;
  const pick = entry.images[Math.floor(Math.random() * entry.images.length)];
  return `/memes/${pick}`;
}

function showMeme(gesture) {
  const img = document.getElementById("meme-image");
  const caption = document.getElementById("meme-caption");
  const path = getMemePath(gesture);
  if (!img || !path) return;

  const label = memeCatalog[gesture]?.label || GESTURE_LABELS[gesture] || gesture;
  if (img.dataset.gesture !== gesture) {
    img.dataset.gesture = gesture;
    img.src = path;
    img.classList.remove("pop");
    void img.offsetWidth;
    img.classList.add("pop");
  }
  caption.textContent = `${label} detected!`;
}

function drawLandmarks(ctx, width, height, handResults, faceResults) {
  ctx.clearRect(0, 0, width, height);

  if (!state.showOverlay) return;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#00ff41";
  ctx.fillStyle = "#00ff41";

  for (const landmarks of faceResults?.faceLandmarks ?? []) {
    ctx.beginPath();
    for (const [a, b] of FACE_MESH) {
      const p1 = landmarks[a];
      const p2 = landmarks[b];
      ctx.moveTo((1 - p1.x) * width, p1.y * height);
      ctx.lineTo((1 - p2.x) * width, p2.y * height);
    }
    ctx.stroke();

    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * width, point.y * height, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const landmarks of handResults?.landmarks ?? []) {
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p1 = landmarks[a];
      const p2 = landmarks[b];
      ctx.moveTo((1 - p1.x) * width, p1.y * height);
      ctx.lineTo((1 - p2.x) * width, p2.y * height);
    }
    ctx.stroke();

    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * width, point.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function initModels() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

async function startCamera() {
  const video = document.getElementById("video");
  const overlay = document.getElementById("overlay");
  const badge = document.getElementById("gesture-badge");
  const startBtn = document.getElementById("start-btn");

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  }

  video.srcObject = stream;
  await video.play();

  const ctx = overlay.getContext("2d");
  state.running = true;
  startBtn.textContent = "Camera Running";
  startBtn.disabled = true;
  badge.textContent = "Strike a pose!";

  let lastTime = performance.now();
  let frameCount = 0;
  let fps = 0;

  const loop = () => {
    if (!state.running) return;

    const now = performance.now();
    frameCount += 1;
    if (now - lastTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastTime = now;
      document.getElementById("fps-label").textContent = `${fps} FPS`;
    }

    if (video.readyState >= 2) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;

      const timestamp = performance.now();
      const handResults = handLandmarker.detectForVideo(video, timestamp);
      const faceResults = faceLandmarker.detectForVideo(video, timestamp);
      const gesture = detectGesture(handResults, faceResults);

      drawLandmarks(ctx, overlay.width, overlay.height, handResults, faceResults);

      if (gesture) {
        currentGesture = gesture;
        badge.textContent = memeCatalog[gesture]?.label || GESTURE_LABELS[gesture];

        if (gesture === stableGesture) {
          stableCount += 1;
        } else {
          stableGesture = gesture;
          stableCount = 1;
        }

        if (stableCount >= STABLE_FRAMES) {
          showMeme(gesture);
        }
      } else {
        currentGesture = null;
        stableGesture = null;
        stableCount = 0;
        badge.textContent = "No gesture detected";
      }
    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

function bindEvents() {
  document.getElementById("start-btn").addEventListener("click", async () => {
    const btn = document.getElementById("start-btn");
    btn.textContent = "Loading AI…";
    btn.disabled = true;
    try {
      if (!handLandmarker) await initModels();
      await startCamera();
    } catch (err) {
      console.error(err);
      btn.textContent = "Retry Camera";
      btn.disabled = false;
      document.getElementById("gesture-badge").textContent = "Camera or model failed — check permissions";
    }
  });

  document.getElementById("overlay-btn").addEventListener("click", () => {
    state.showOverlay = !state.showOverlay;
    document.getElementById("overlay-btn").textContent = state.showOverlay ? "Hide Overlay" : "Show Overlay";
    if (!state.showOverlay) {
      const overlay = document.getElementById("overlay");
      overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    }
  });

  document.querySelector('[data-action="help"]').addEventListener("click", () => {
    document.getElementById("help-window").classList.remove("hidden");
  });

  document.querySelector('[data-close="help-window"]')?.addEventListener("click", () => {
    document.getElementById("help-window").classList.add("hidden");
  });
}

async function boot() {
  buildUI();
  populateHelp();
  updateClock();
  setInterval(updateClock, 30_000);
  await loadMemes();
  bindEvents();

  const img = document.getElementById("meme-image");
  img.src = "/memes/wave.svg";
}

boot();
