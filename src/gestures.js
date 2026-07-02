const FINGER = {
  thumb: { tip: 4, pip: 3, mcp: 2 },
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
};

const POSE_KEYS = new Set([
  "cover_mouth", "thumbs_up", "peace_sign", "wave", "facepalm", "thinking",
  "pointing", "shrug", "stop", "celebrate", "timeout", "angry_pose",
]);

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function handCenter(hand) {
  return { x: (hand[0].x + hand[9].x) / 2, y: (hand[0].y + hand[9].y) / 2 };
}

function isFingerExtended(hand, finger) {
  const { tip, pip, mcp } = FINGER[finger];
  const tipLm = hand[tip];
  const pipLm = hand[pip];
  const mcpLm = hand[mcp];

  if (finger === "thumb") {
    return dist(tipLm, hand[5]) > dist(pipLm, hand[5]) * 1.05;
  }

  return tipLm.y < pipLm.y + 0.01 && pipLm.y < mcpLm.y + 0.04;
}

function countExtended(hand) {
  return Object.keys(FINGER).filter((f) => isFingerExtended(hand, f)).length;
}

function isFist(hand) {
  return countExtended(hand) <= 1;
}

function nearPoint(hand, point, threshold = 0.12) {
  return [handCenter(hand), hand[8], hand[9], hand[0], hand[4]].some(
    (p) => dist(p, point) < threshold
  );
}

function blendshapeMap(faceResults) {
  const map = {};
  for (const item of faceResults?.faceBlendshapes?.[0]?.categories ?? []) {
    map[item.categoryName] = item.score;
  }
  return map;
}

function headYaw(faceLandmarks) {
  if (!faceLandmarks?.length) return 0;
  const fl = faceLandmarks[0];
  const leftEye = fl[33];
  const rightEye = fl[263];
  const nose = fl[1];
  return Math.abs(nose.x - (leftEye.x + rightEye.x) / 2);
}

function addScore(scores, key, value) {
  if (value <= 0) return;
  scores[key] = Math.max(scores[key] ?? 0, Math.min(value, 1));
}

function scoreHandPoses(hands, faceLandmarks, scores) {
  if (!faceLandmarks.length) return;
  const fl = faceLandmarks[0];
  const mouth = {
    x: (fl[13].x + fl[14].x) / 2,
    y: (fl[13].y + fl[14].y) / 2,
  };
  const forehead = fl[10];
  const chin = fl[152];
  const leftTemple = fl[234];
  const rightTemple = fl[454];
  const thinkingPoint = {
    x: (chin.x + fl[13].x) / 2,
    y: chin.y + (fl[13].y - chin.y) * 0.35,
  };
  const chest = {
    x: (leftTemple.x + rightTemple.x) / 2,
    y: (leftTemple.y + rightTemple.y) / 2 + 0.1,
  };

  for (const hand of hands) {
    const mouthDist = Math.min(
      dist(handCenter(hand), mouth),
      dist(hand[8], mouth),
      dist(hand[9], mouth)
    );
    if (mouthDist < 0.22) addScore(scores, "cover_mouth", 1 - mouthDist / 0.22);

    const foreheadDist = Math.min(dist(handCenter(hand), forehead), dist(hand[8], forehead));
    if (foreheadDist < 0.2) addScore(scores, "facepalm", 1 - foreheadDist / 0.2);

    const thinkDist = Math.min(dist(handCenter(hand), thinkingPoint), dist(hand[8], thinkingPoint));
    if (thinkDist < 0.18 && countExtended(hand) <= 3) {
      addScore(scores, "thinking", 1 - thinkDist / 0.18);
    }

    if (isFingerExtended(hand, "index") && !isFingerExtended(hand, "middle")) {
      const chestDist = Math.min(dist(hand[8], chest), dist(handCenter(hand), chest));
      if (chestDist < 0.2) addScore(scores, "pointing", 1 - chestDist / 0.2);
    }

    if (isFingerExtended(hand, "thumb") && countExtended(hand) <= 2) {
      addScore(scores, "thumbs_up", 0.75);
    }

    if (isFingerExtended(hand, "index") && isFingerExtended(hand, "middle") && countExtended(hand) <= 3) {
      addScore(scores, "peace_sign", 0.8);
    }

    const extended = countExtended(hand);
    if (extended >= 4) {
      addScore(scores, "wave", 0.55 + extended * 0.05);
      if (hand[9].z < hand[0].z - 0.02) addScore(scores, "stop", 0.7);
    }
  }

  if (hands.length >= 2) {
    const h0 = hands[0];
    const h1 = hands[1];
    const c0 = handCenter(h0);
    const c1 = handCenter(h1);
    const highEnough = c0.y < chin.y && c1.y < chin.y;

    if (highEnough) {
      const nearHead =
        nearPoint(h0, leftTemple, 0.22) ||
        nearPoint(h0, rightTemple, 0.22) ||
        nearPoint(h0, forehead, 0.2) ||
        nearPoint(h1, leftTemple, 0.22) ||
        nearPoint(h1, rightTemple, 0.22) ||
        nearPoint(h1, forehead, 0.2);

      if (nearHead) addScore(scores, "surprised", 0.82);
      if (c0.y < forehead.y + 0.06 && c1.y < forehead.y + 0.06) {
        addScore(scores, "celebrate", 0.78);
      }

      if (isFist(h0) && isFist(h1) && c0.y < chest.y && c1.y < chest.y) {
        addScore(scores, "angry_pose", 0.85);
        addScore(scores, "angry", 0.7);
      }

      if (c0.y < leftTemple.y + 0.08 && c1.y < rightTemple.y + 0.08) {
        addScore(scores, "shrug", 0.72);
      }

      const hHand = countExtended(h0) >= 4 ? h0 : countExtended(h1) >= 4 ? h1 : null;
      const vHand = hHand === h0 ? h1 : hHand === h1 ? h0 : null;
      if (hHand && vHand && countExtended(vHand) >= 3) {
        addScore(scores, "timeout", 0.75);
      }
    }
  }
}

function scoreExpressions(map, faceLandmarks, scores) {
  if (!Object.keys(map).length) return;

  const smile = ((map.mouthSmileLeft ?? 0) + (map.mouthSmileRight ?? 0)) / 2;
  const frown = ((map.mouthFrownLeft ?? 0) + (map.mouthFrownRight ?? 0)) / 2;
  const jawOpen = map.jawOpen ?? 0;
  const browDown = ((map.browDownLeft ?? 0) + (map.browDownRight ?? 0)) / 2;
  const eyeWide = ((map.eyeWideLeft ?? 0) + (map.eyeWideRight ?? 0)) / 2;
  const pucker = map.mouthPucker ?? 0;
  const sneer = ((map.noseSneerLeft ?? 0) + (map.noseSneerRight ?? 0)) / 2;
  const squintL = map.eyeSquintLeft ?? 0;
  const squintR = map.eyeSquintRight ?? 0;
  const yaw = headYaw(faceLandmarks);

  if (smile > 0.18 && frown < 0.25 && jawOpen < 0.45) addScore(scores, "smile", smile);
  if (jawOpen > 0.28 && eyeWide > 0.18) addScore(scores, "surprised", jawOpen * 0.55 + eyeWide * 0.45);
  if (browDown > 0.2 || sneer > 0.12) addScore(scores, "angry", browDown * 0.6 + sneer * 0.4 + jawOpen * 0.2);
  if (frown > 0.18 && smile < 0.25) addScore(scores, "sad", frown);
  if (pucker > 0.28) addScore(scores, "kiss", pucker);
  if (jawOpen > 0.35 && smile > 0.12) addScore(scores, "tongue_out", jawOpen * 0.65 + smile * 0.35);

  if (yaw > 0.008 || Math.abs(squintL - squintR) > 0.05) {
    addScore(scores, "side_eye", yaw * 8 + Math.abs(squintL - squintR));
  }
}

export function detectMatch(handResults, faceResults) {
  const scores = {};
  const faceLandmarks = faceResults?.faceLandmarks ?? [];
  const hands = handResults?.landmarks ?? [];

  scoreHandPoses(hands, faceLandmarks, scores);
  scoreExpressions(blendshapeMap(faceResults), faceLandmarks, scores);

  if (scores.cover_mouth >= 0.45) {
    delete scores.smile;
    delete scores.kiss;
  }

  let bestKey = null;
  let bestScore = 0.28;

  for (const [key, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }

  if (!bestKey) return null;

  if (bestKey === "angry_pose") bestKey = "angry";

  return {
    key: bestKey,
    kind: POSE_KEYS.has(bestKey) ? "pose" : "expression",
    score: bestScore,
  };
}

export const DEFAULT_LABELS = {
  cover_mouth: "Cover mouth",
  thumbs_up: "Thumbs up",
  peace_sign: "Peace sign",
  wave: "Wave",
  facepalm: "Facepalm",
  thinking: "Thinking",
  pointing: "Pointing",
  shrug: "Shrug",
  stop: "Stop hand",
  celebrate: "Celebrate",
  timeout: "Timeout",
  smile: "Smile",
  surprised: "Surprised",
  angry: "Angry",
  sad: "Sad",
  kiss: "Kiss face",
  tongue_out: "Tongue out",
  side_eye: "Side eye",
};
