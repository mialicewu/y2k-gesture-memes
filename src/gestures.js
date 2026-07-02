const FINGER = {
  thumb: { tip: 4, pip: 3, mcp: 2 },
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
};

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function handCenter(hand) {
  const wrist = hand[0];
  const middleMcp = hand[9];
  return {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2,
  };
}

function isFingerExtended(hand, finger) {
  const { tip, pip, mcp } = FINGER[finger];
  const tipLm = hand[tip];
  const pipLm = hand[pip];
  const mcpLm = hand[mcp];

  if (finger === "thumb") {
    const indexMcp = hand[5];
    return dist(tipLm, indexMcp) > dist(pipLm, indexMcp) * 1.15;
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
  const indexTip = hand[8];
  const palm = hand[9];
  return (
    dist(center, facePoint) < threshold ||
    dist(indexTip, facePoint) < threshold ||
    dist(palm, facePoint) < threshold
  );
}

function detectHandGesture(hand, faceLandmarks) {
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
    const upperLip = fl[13];
    const lowerLip = fl[14];
    const mouth = { x: (upperLip.x + lowerLip.x) / 2, y: (upperLip.y + lowerLip.y) / 2 };
    const forehead = fl[10];
    const chin = fl[152];

    if (nearFacePoint(hand, mouth, 0.14)) {
      return "cover_mouth";
    }

    if (nearFacePoint(hand, forehead, 0.13)) {
      return "facepalm";
    }

    const thinkingPoint = {
      x: (chin.x + upperLip.x) / 2,
      y: chin.y + (upperLip.y - chin.y) * 0.35,
    };
    if (nearFacePoint(hand, thinkingPoint, 0.11) && extended <= 2) {
      return "thinking";
    }
  }

  if (thumbUp) return "thumbs_up";
  if (peace) return "peace_sign";
  if (pointing) return "pointing";
  if (wave) return "wave";

  return null;
}

export function detectGesture(handResults, faceResults) {
  const hands = handResults?.landmarks ?? [];
  const faceLandmarks = faceResults?.faceLandmarks ?? [];

  if (hands.length === 0) return null;

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
    const gesture = detectHandGesture(hand, faceLandmarks);
    if (gesture) return gesture;
  }

  return null;
}

export const GESTURE_LABELS = {
  cover_mouth: "Cover mouth",
  thumbs_up: "Thumbs up",
  peace_sign: "Peace sign",
  wave: "Wave",
  facepalm: "Facepalm",
  thinking: "Thinking",
  pointing: "Pointing",
  shrug: "Shrug",
};
