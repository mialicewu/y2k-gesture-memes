import "./style.css";
import { FilesetResolver, HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import { detectMatch, DEFAULT_LABELS } from "./gestures.js";

const asset = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

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
];

let handLandmarker = null;
let faceLandmarker = null;
let memeCatalog = {};
let stableMatch = null;
let stableCount = 0;
const STABLE_FRAMES = 6;

const state = {
  running: false,
  modelsReady: false,
  showOverlay: true,
  cameraStream: null,
};

function buildUI() {
  document.getElementById("app").innerHTML = `
    <div class="desktop">
      <aside class="desktop-icons">
        <button class="desktop-icon" type="button" data-action="help">
          <span class="icon icon-help"></span>
          <span>Help</span>
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
              <div class="video-mirror">
                <video id="video" playsinline muted autoplay></video>
                <canvas id="overlay"></canvas>
              </div>
              <div class="gesture-badge" id="gesture-badge">Click Start Camera</div>
              <div class="status-pill" id="status-pill">Camera off</div>
              <div class="scanlines"></div>
            </div>
            <fieldset class="controls-fieldset">
              <legend>Controls</legend>
              <div class="field-row">
                <button id="start-btn" type="button">Start Camera</button>
                <button id="overlay-btn" type="button">Hide Overlay</button>
              </div>
              <p class="hint">Pose + expression both work. Try smiling, winking, thumbs up, or covering your mouth.</p>
            </fieldset>
          </div>
          <div class="status-bar">
            <p class="status-bar-field" id="mode-label">Pose + Face</p>
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
            <p class="meme-caption" id="meme-caption">Make a pose or face to summon a sticker</p>
          </div>
        </div>

        <div class="window help-window hidden" id="help-window">
          <div class="title-bar">
            <div class="title-bar-text">Help — Poses &amp; Expressions</div>
            <div class="title-bar-controls">
              <button aria-label="Close" data-close="help-window"></button>
            </div>
          </div>
          <div class="window-body help-body">
            <p><strong>Poses</strong></p>
            <ul class="gesture-list" id="pose-list"></ul>
            <p><strong>Expressions</strong></p>
            <ul class="gesture-list" id="expression-list"></ul>
            <p class="hint">Add images to <code>public/memes/</code> and edit <code>memes.json</code>.</p>
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

function setBadge(text) {
  document.getElementById("gesture-badge").textContent = text;
}

function setStatus(text) {
  document.getElementById("status-pill").textContent = text;
}

function populateHelp() {
  const poses = document.getElementById("pose-list");
  const expressions = document.getElementById("expression-list");
  if (!poses || !expressions) return;

  poses.innerHTML = "";
  expressions.innerHTML = "";

  for (const [key, entry] of Object.entries(memeCatalog)) {
    const label = entry.label || DEFAULT_LABELS[key] || key;
    const li = `<li><strong>${label}</strong></li>`;
    if (entry.kind === "expression") {
      expressions.innerHTML += li;
    } else {
      poses.innerHTML += li;
    }
  }
}

async function loadMemes() {
  const res = await fetch(asset("memes/memes.json"));
  memeCatalog = await res.json();
}

function getMemePath(key) {
  const entry = memeCatalog[key];
  if (!entry?.images?.length) return null;
  const pick = entry.images[Math.floor(Math.random() * entry.images.length)];
  return asset(`memes/${pick}`);
}

function labelFor(key) {
  return memeCatalog[key]?.label || DEFAULT_LABELS[key] || key;
}

function showMeme(match) {
  const img = document.getElementById("meme-image");
  const caption = document.getElementById("meme-caption");
  const path = getMemePath(match.key);
  if (!img || !path) return;

  const kind = match.kind === "expression" ? "expression" : "pose";
  if (img.dataset.matchKey !== match.key) {
    img.dataset.matchKey = match.key;
    img.src = path;
    img.classList.remove("pop");
    void img.offsetWidth;
    img.classList.add("pop");
  }
  caption.textContent = `${labelFor(match.key)} (${kind}) detected!`;
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
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
    }
    ctx.stroke();
  }

  for (const landmarks of handResults?.landmarks ?? []) {
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p1 = landmarks[a];
      const p2 = landmarks[b];
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
    }
    ctx.stroke();

    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function createLandmarkers(delegate) {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 2,
  });

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
}

async function initModels() {
  if (state.modelsReady) return;
  setStatus("Loading AI models…");
  try {
    await createLandmarkers("GPU");
  } catch {
    await createLandmarkers("CPU");
  }
  state.modelsReady = true;
  setStatus("AI ready — strike a pose!");
}

async function openCamera() {
  if (state.cameraStream) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not available. Open the site over HTTPS.");
  }

  setStatus("Requesting camera…");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  const video = document.getElementById("video");
  video.srcObject = stream;
  state.cameraStream = stream;
  await video.play();
  setBadge("Camera live — loading AI…");
  setStatus("Camera on");
}

function startLoop() {
  const video = document.getElementById("video");
  const overlay = document.getElementById("overlay");
  const ctx = overlay.getContext("2d");
  state.running = true;

  let lastTime = performance.now();
  let frameCount = 0;

  const loop = () => {
    if (!state.running) return;

    const now = performance.now();
    frameCount += 1;
    if (now - lastTime >= 1000) {
      document.getElementById("fps-label").textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastTime = now;
    }

    if (video.readyState >= 2) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;

      if (state.modelsReady) {
        const timestamp = performance.now();
        const handResults = handLandmarker.detectForVideo(video, timestamp);
        const faceResults = faceLandmarker.detectForVideo(video, timestamp);
        const match = detectMatch(handResults, faceResults);

        drawLandmarks(ctx, overlay.width, overlay.height, handResults, faceResults);

        if (match) {
          setBadge(labelFor(match.key));
          document.getElementById("mode-label").textContent =
            match.kind === "expression" ? "Expression" : "Pose";

          if (match.key === stableMatch?.key) {
            stableCount += 1;
          } else {
            stableMatch = match;
            stableCount = 1;
          }

          if (stableCount >= STABLE_FRAMES) {
            showMeme(match);
          }
        } else {
          stableMatch = null;
          stableCount = 0;
          setBadge("Watching… smile or strike a pose");
          document.getElementById("mode-label").textContent = "Pose + Face";
        }
      } else {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

async function startApp() {
  const btn = document.getElementById("start-btn");
  btn.disabled = true;
  btn.textContent = "Starting…";

  try {
    await openCamera();
    startLoop();
    await initModels();
    setBadge("Watching… smile or strike a pose");
    btn.textContent = "Camera Running";
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Retry Camera";
    setBadge("Camera failed");
    setStatus(err.message || "Allow camera access and retry");
  }
}

function bindEvents() {
  document.getElementById("start-btn").addEventListener("click", startApp);

  document.getElementById("overlay-btn").addEventListener("click", () => {
    state.showOverlay = !state.showOverlay;
    document.getElementById("overlay-btn").textContent = state.showOverlay ? "Hide Overlay" : "Show Overlay";
  });

  document.querySelector('[data-action="help"]')?.addEventListener("click", () => {
    document.getElementById("help-window").classList.remove("hidden");
  });

  document.querySelector('[data-close="help-window"]')?.addEventListener("click", () => {
    document.getElementById("help-window").classList.add("hidden");
  });
}

async function boot() {
  buildUI();
  await loadMemes();
  populateHelp();
  bindEvents();
  document.getElementById("meme-image").src = asset("memes/user/cover_mouth-1.webp");

  const clock = document.getElementById("clock");
  const tick = () => {
    clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 30_000);
}

boot();
