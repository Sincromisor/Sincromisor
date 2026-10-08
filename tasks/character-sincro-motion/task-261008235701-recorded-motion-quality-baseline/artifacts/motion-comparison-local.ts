import type { SincroHandMotionSnapshot } from "./features/gaze/handTracking/sincroHandMotionSnapshot";
import type { GestureIntentObservation } from "./character/motionIntent/motionIntentEstimator";
import { normalizeSincroGestureRecognizerResult } from "./features/gaze/gestureTracking/sincroGestureTrackerHelpers";
import { toGestureIntentObservation } from "./features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { recomputeMotionReplay } from "./character/motionEvaluation/motionReplayComparison";
export async function compare(fixture: string, label: string) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const { userData } = await loader.loadAsync("/characters/default.vrm");
  let text = await (
    await fetch(
      `http://127.0.0.1:8877/replay/${fixture}.temporal-primary.ndjson`,
    )
  ).text();
  if (label.includes("deleted") || label.includes("missing")) {
    const rows = text
      .split("\n")
      .filter(Boolean)
      .map((x) => JSON.parse(x));
    const first = rows[1].frame.timestamp.mediaTimeMs;
    text = rows
      .filter((row) => {
        if (row.recordType !== "frame") return true;
        const age = row.frame.timestamp.mediaTimeMs - first;
        if (age < 4000 || age > 6000) return true;
        if (label.includes("deleted")) return false;
        row.frame.mediapipe.pose = { landmarks: [], worldLandmarks: [] };
        return true;
      })
      .map((row) => JSON.stringify(row))
      .join("\n");
  }
  const manifest = JSON.parse(text.split("\n")[0]).manifest;
  let handObservations, gestureObservations;
  if (label.includes("hands")) {
    const data = await (
      await fetch(`http://127.0.0.1:8878/hand-observations-${fixture}.json`)
    ).json();
    handObservations = new Map<number, SincroHandMotionSnapshot>(
      data.observations.map((x: any) => [x.mediaTimeMs, x.hand]),
    );
    gestureObservations = new Map<number, GestureIntentObservation>(
      data.observations.map((x: any) => {
        const sides = normalizeSincroGestureRecognizerResult({
          result: x.rawGesture,
          hand: x.hand,
        });
        return [
          x.mediaTimeMs,
          toGestureIntentObservation({
            trackingEnabled: true,
            source: "gesture-recognizer",
            left: sides.left,
            right: sides.right,
            warnings: [],
            inferenceTimeMs: 0,
            inferenceFps: 0,
            lastUpdatedAtMs: x.mediaTimeMs,
          }),
        ];
      }),
    );
  }
  const result = recomputeMotionReplay({
    recordingText: text,
    vrm: userData.vrm,
    source: "mediapipe-raw-result",
    config: manifest.pipeline.retargetConfig,
    handObservations,
    gestureObservations,
  });
  await fetch(`http://127.0.0.1:8877/${label}-${fixture}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  return {
    fixture,
    frames: result.samples.length,
    available: result.samples.filter((s) => s.finalPose.status === "available")
      .length,
    torso: [...new Set(result.samples.map((s) => s.canonical?.torso.source))],
  };
}
import { HandLandmarker, GestureRecognizer } from "@mediapipe/tasks-vision";
import { loadMediaPipeVisionFileset } from "./features/gaze/trackingRuntime/mediaPipeVisionFileset";
import { normalizeSincroHandLandmarkerResult } from "./features/gaze/handTracking/sincroHandNormalization";
import { assignSincroHandObservationsToPose } from "./features/gaze/handTracking/sincroHandAssignment";

export async function inferHands(fixture: string) {
  const vision = await loadMediaPipeVisionFileset();
  const model = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/3rd_party/hand_landmarker.task",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const gesture = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/3rd_party/gesture_recognizer.task",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
  const text = await (
    await fetch(
      `http://127.0.0.1:8877/replay/${fixture}.temporal-primary.ndjson`,
    )
  ).text();
  const frames = text
    .split("\n")
    .filter(Boolean)
    .map((x) => JSON.parse(x))
    .filter((x) => x.recordType === "frame")
    .map((x) => x.frame);
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.src = URL.createObjectURL(
    await (await fetch(`http://127.0.0.1:8878/${fixture}.webm`)).blob(),
  );
  document.body.append(video);
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(Error("動画読込失敗"));
  });
  const observations = [];
  let previous: any;
  try {
    for (const frame of frames) {
      const videoTimeMs = frame.timestamp.mediaTimeMs;
      if (videoTimeMs < 2000 || videoTimeMs > 8000) continue;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = videoTimeMs / 1000;
      });
      if (Math.abs(video.currentTime * 1000 - videoTimeMs) > 1)
        throw Error("動画シーク不一致");
      const raw = model.detectForVideo(video, frame.timestamp.mediaTimeMs);
      const rawGesture = gesture.recognizeForVideo(
        video,
        frame.timestamp.mediaTimeMs,
      );
      const wrist = (side: "left" | "right") => {
        const target = frame.poseSnapshot[side + "Arm"].targets.wrist;
        return {
          side,
          point: [target.cameraX, target.cameraY] as [number, number],
          confidence: target.confidence,
        };
      };
      const assignment = assignSincroHandObservationsToPose({
        observations: normalizeSincroHandLandmarkerResult({ result: raw }),
        leftWrist: wrist("left"),
        rightWrist: wrist("right"),
        source: "full-frame-fallback",
        previous,
      });
      const hand = {
        trackingEnabled: true,
        detected: assignment.leftHand.detected || assignment.rightHand.detected,
        leftHand: assignment.leftHand,
        rightHand: assignment.rightHand,
        inferenceTimeMs: 0,
        inferenceFps: 0,
        lastUpdatedAtMs: frame.timestamp.mediaTimeMs,
      };
      previous = hand;
      observations.push({
        mediaTimeMs: frame.timestamp.mediaTimeMs,
        videoTimeMs,
        decodedVideoTimeMs: video.currentTime * 1000,
        hand,
        raw,
        rawGesture,
      });
    }
    await fetch(`http://127.0.0.1:8877/hand-observations-${fixture}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixture,
        source: "video",
        alignment:
          "recorded-mediaTimeMs; selected pose landmarks visually matched; exact capture latency unknown",
        observations,
      }),
    });
    return {
      fixture,
      frames: observations.length,
      detected: observations.filter((x) => x.hand.detected).length,
    };
  } finally {
    model.close();
    gesture.close();
    video.remove();
  }
}
