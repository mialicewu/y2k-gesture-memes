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
  return {
    x: (hand[0].x + hand[9].x) / 2,
    y: (hand[0].y + hand[9].y) / 2,
  };
}

function isFingerExtended(hand, finger) {
  const { tip, pip, mcp } = FINGER[finger];
  const tipLm = hand[tip];
  const pipLm = hand[pip];
  const mcpLm = hand[mcp];

  if (finger === "thumb") {
    const indexMcp = hand[5];
    return dist(tipLm, indexMcp) > dist(pipLm, indexMcp) * 1.12;
  }

  return tipLm.y < pipLm.y && pipLm.y < mcpLm.y + 0.02;
}

function isFingerCurled(hand, finger) {
  return !isFingerExtended(hand, finger);
}

function countExtended(hand) {
  return Object.keys(FINGER).filter((f) => isFingerExtended(hand, f)).length;
}

function nearFacePoint(hand, facePoint, threshold = 0.12) {
  const center = handCenter(hand);
  return (
    dist(center, facePoint) < threshold ||
    dist(hand[8], facePoint) < threshold ||
    dist(hand[9], facePoint) < threshold
  );
}

function blendshapeMap(faceResults) {
  const categories = faceResults?.faceBlendshapes?.[0]?.categories ?? [];
  const map = {};
  for (const item of categories) {
    map[item.categoryName] = item.score;
  }
  return map;
}

function scoreExpression(map) {
  const candidates = [];

  const smile = ((map.mouthSmileLeft ?? 0) + (map.mouthSmileRight ?? 0)) / 2;
  const frown = ((map.mouthFrownLeft ?? 0) + (map.mouthFrownRight ?? 0)) / 2;
  const jawOpen = map.jawOpen ?? 0;
  const browInnerUp = map.browInnerUp ?? 0;
  const browDown = ((map.browDownLeft ?? 0) + (map.browDownRight ?? 0)) / 2;
  const eyeWide = ((map.eyeWideLeft ?? 0) + (map.eyeWideRight ?? 0)) / 2;
  const blinkLeft = map.eyeBlinkLeft ?? 0;
  const blinkRight = map.eyeBlinkRight ?? 0;
  const pucker = map.mouthPucker ?? 0;
  const sneer = ((map.noseSneerLeft ?? 0) + (map.noseSneerRight ?? 0)) / 2;

  if (blinkLeft > 0.55 && blinkRight < 0.25) candidates.push(["wink", blinkLeft]);
  if (blinkRight > 0.55 && blinkLeft < 0.25) candidates.push(["wink", blinkRight]);

  if (jawOpen > 0.45 && eyeWide > 0.35 && browInnerUp > 0.25) {
    candidates.push(["surprised", jawOpen * 0.5 + eyeWide * 0.3 + browInnerUp * 0.2]);
  }

  if (browDown > 0.35 && sneer > 0.2 && smile < 0.25) {
    candidates.push(["angry", browDown * 0.6 + sneer * 0.4]);
  }

  if (frown > 0.35 && smile < 0.2 && browInnerUp > 0.15) {
    candidates.push(["sad", frown * 0.7 + browInnerUp * 0.3]);
  }

  if (pucker > 0.45 && jawOpen < 0.25) {
    candidates.push(["kiss", pucker]);
  }

  if (jawOpen > 0.55 && smile > 0.25) {
    candidates.push(["tongue_out", jawOpen * 0.6 + smile * 0.4]);
  }

  if (smile > 0.42 && frown < 0.2) {
    candidates.push(["smile", smile]);
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}

function detectHandPose(hand, faceLandmarks) {
  const extended = countExtended(hand);

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

  const pointing =
    isFingerExtended(hand, "index") &&
    isFingerCurled(hand, "middle") &&
    isFingerCurled(hand, "ring") &&
    isFingerCurled(hand, "pinky") &&
    isFingerCurled(hand, "thumb");

  const wave = extended >= 4;

  if (faceLandmarks?.length) {
    const fl = faceLandmarks[0];
    const mouth = {
      x: (fl[13].x + fl[14].x) / 2,
      y: (fl[13].y + fl[14].y) / 2,
    };
    const forehead = fl[10];
    const chin = fl[152];
    const thinkingPoint = {
      x: (chin.x + fl[13].x) / 2,
      y: chin.y + (fl[13].y - chin.y) * 0.35,
    };

    if (nearFacePoint(hand, mouth, 0.14)) return "cover_mouth";
    if (nearFacePoint(hand, forehead, 0.13)) return "facepalm";
    if (nearFacePoint(hand, thinkingPoint, 0.11) && extended <= 2) return "thinking";
  }

  if (thumbUp) return "thumbs_up";
  if (peace) return "peace_sign";
  if (pointing) return "pointing";
  if (wave) return "wave";

  return null;
}

function detectHandPoses(handResults, faceLandmarks) {
  const hands = handResults?.landmarks ?? [];

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

export function detectMatch(handResults, faceResults) {
  const faceLandmarks = faceResults?.faceLandmarks ?? [];
  const handPose = detectHandPoses(handResults, faceLandmarks);
  const expression = scoreExpression(blendshapeMap(faceResults));

  if (handPose) {
    return { key: handPose, kind: "pose" };
  }

  if (expression) {
    return { key: expression, kind: "expression" };
  }

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
  smile: "Smile",
  surprised: "Surprised",
  angry: "Angry",
  sad: "Sad",
  wink: "Wink",
  kiss: "Kiss face",
  tongue_out: "Tongue out",
};
