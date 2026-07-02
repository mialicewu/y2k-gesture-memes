const FINGER = {
  thumb: { tip: 4, pip: 3, mcp: 2 },
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
};

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
    const indexMcp = hand[5];
    return dist(tipLm, indexMcp) > dist(pipLm, indexMcp) * 1.1;
  }

  return tipLm.y < pipLm.y && pipLm.y < mcpLm.y + 0.03;
}

function isFingerCurled(hand, finger) {
  return !isFingerExtended(hand, finger);
}

function countExtended(hand) {
  return Object.keys(FINGER).filter((f) => isFingerExtended(hand, f)).length;
}

function nearPoint(hand, point, threshold = 0.12) {
  return (
    dist(handCenter(hand), point) < threshold ||
    dist(hand[8], point) < threshold ||
    dist(hand[9], point) < threshold ||
    dist(hand[0], point) < threshold
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
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  return Math.abs(nose.x - eyeCenterX);
}

function handsBehindHead(hands, faceLandmarks) {
  if (hands.length < 2 || !faceLandmarks.length) return false;
  const fl = faceLandmarks[0];
  const leftTemple = fl[234];
  const rightTemple = fl[454];
  const forehead = fl[10];
  const chin = fl[152];

  let leftUp = false;
  let rightUp = false;
  for (const hand of hands) {
    const wrist = hand[0];
    if (wrist.y < chin.y - 0.05 && nearPoint(hand, leftTemple, 0.18)) leftUp = true;
    if (wrist.y < chin.y - 0.05 && nearPoint(hand, rightTemple, 0.18)) rightUp = true;
    if (wrist.y < forehead.y + 0.03 && nearPoint(hand, forehead, 0.16)) {
      leftUp = true;
      rightUp = true;
    }
  }
  return leftUp && rightUp;
}

function bothHandsUp(hands, faceLandmarks) {
  if (hands.length < 2 || !faceLandmarks.length) return false;
  const fl = faceLandmarks[0];
  const brow = fl[10];
  const h0 = handCenter(hands[0]);
  const h1 = handCenter(hands[1]);
  return (
    h0.y < brow.y + 0.08 &&
    h1.y < brow.y + 0.08 &&
    countExtended(hands[0]) >= 3 &&
    countExtended(hands[1]) >= 3
  );
}

function detectHandPose(hand, faceLandmarks) {
  const extended = countExtended(hand);

  if (faceLandmarks?.length) {
    const fl = faceLandmarks[0];
    const upperLip = fl[13];
    const lowerLip = fl[14];
    const mouth = { x: (upperLip.x + lowerLip.x) / 2, y: (upperLip.y + lowerLip.y) / 2 };
    const forehead = fl[10];
    const chin = fl[152];
    const thinkingPoint = {
      x: (chin.x + upperLip.x) / 2,
      y: chin.y + (upperLip.y - chin.y) * 0.35,
    };
    const chest = { x: (fl[234].x + fl[454].x) / 2, y: (fl[234].y + fl[454].y) / 2 + 0.08 };

    if (nearPoint(hand, mouth, 0.16)) return "cover_mouth";
    if (nearPoint(hand, forehead, 0.14)) return "facepalm";
    if (nearPoint(hand, thinkingPoint, 0.12) && extended <= 2) return "thinking";
    if (
      isFingerExtended(hand, "index") &&
      isFingerCurled(hand, "middle") &&
      nearPoint(hand, chest, 0.14)
    ) {
      return "pointing";
    }
  }

  const thumbUp =
    isFingerExtended(hand, "thumb") &&
    isFingerCurled(hand, "index") &&
    isFingerCurled(hand, "middle") &&
    isFingerCurled(hand, "ring") &&
    isFingerCurled(hand, "pinky");

  const peace =
    isFingerExtended(hand, "index") &&
    isFingerExtended(hand, "middle") &&
    isFingerCurled(hand, "ring") &&
    isFingerCurled(hand, "pinky");

  const stop =
    extended >= 4 &&
    Math.abs(hand[9].z - hand[0].z) < 0.06 &&
    hand[9].y > hand[0].y - 0.05;

  if (thumbUp) return "thumbs_up";
  if (peace) return "peace_sign";
  if (stop) return "stop";
  if (extended >= 4) return "wave";

  return null;
}

function detectHandPoses(handResults, faceLandmarks) {
  const hands = handResults?.landmarks ?? [];

  if (handsBehindHead(hands, faceLandmarks)) return "surprised";
  if (bothHandsUp(hands, faceLandmarks)) return "celebrate";

  if (hands.length >= 2 && faceLandmarks.length > 0) {
    const fl = faceLandmarks[0];
    const leftShoulder = { x: fl[234]?.x ?? 0.25, y: fl[234]?.y ?? 0.75 };
    const rightShoulder = { x: fl[454]?.x ?? 0.75, y: fl[454]?.y ?? 0.75 };
    const h0 = handCenter(hands[0]);
    const h1 = handCenter(hands[1]);
    const bothUp = h0.y < leftShoulder.y + 0.05 && h1.y < rightShoulder.y + 0.05;
    const bothOpen = countExtended(hands[0]) >= 3 && countExtended(hands[1]) >= 3;
    if (bothUp && bothOpen) return "shrug";
  }

  for (const hand of hands) {
    const pose = detectHandPose(hand, faceLandmarks);
    if (pose) return pose;
  }

  return null;
}

function detectExpression(faceResults) {
  const map = blendshapeMap(faceResults);
  if (!Object.keys(map).length) return null;

  const smile = ((map.mouthSmileLeft ?? 0) + (map.mouthSmileRight ?? 0)) / 2;
  const frown = ((map.mouthFrownLeft ?? 0) + (map.mouthFrownRight ?? 0)) / 2;
  const jawOpen = map.jawOpen ?? 0;
  const browInnerUp = map.browInnerUp ?? 0;
  const browDown = ((map.browDownLeft ?? 0) + (map.browDownRight ?? 0)) / 2;
  const eyeWide = ((map.eyeWideLeft ?? 0) + (map.eyeWideRight ?? 0)) / 2;
  const pucker = map.mouthPucker ?? 0;
  const sneer = ((map.noseSneerLeft ?? 0) + (map.noseSneerRight ?? 0)) / 2;
  const squintL = map.eyeSquintLeft ?? 0;
  const squintR = map.eyeSquintRight ?? 0;
  const yaw = headYaw(faceResults.faceLandmarks);

  const candidates = [];

  if (yaw > 0.018 && Math.abs(squintL - squintR) > 0.08) {
    candidates.push(["side_eye", yaw + Math.abs(squintL - squintR)]);
  }

  if (jawOpen > 0.5 && eyeWide > 0.35) {
    candidates.push(["surprised", jawOpen * 0.6 + eyeWide * 0.4]);
  }

  if (browDown > 0.35 && sneer > 0.15 && jawOpen > 0.25) {
    candidates.push(["angry", browDown * 0.5 + jawOpen * 0.3 + sneer * 0.2]);
  }

  if (frown > 0.35 && smile < 0.15) {
    candidates.push(["sad", frown]);
  }

  if (pucker > 0.42 && jawOpen < 0.3) {
    candidates.push(["kiss", pucker]);
  }

  if (jawOpen > 0.55 && smile > 0.2) {
    candidates.push(["tongue_out", jawOpen * 0.7 + smile * 0.3]);
  }

  if (smile > 0.38 && frown < 0.2 && jawOpen < 0.35) {
    candidates.push(["smile", smile]);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}

export function detectMatch(handResults, faceResults) {
  const faceLandmarks = faceResults?.faceLandmarks ?? [];
  const handPose = detectHandPoses(handResults, faceLandmarks);
  const expression = detectExpression(faceResults);

  if (handPose) return { key: handPose, kind: "pose" };
  if (expression) return { key: expression, kind: "expression" };
  return null;
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
