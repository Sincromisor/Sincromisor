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
    config: {
      ...manifest.pipeline.retargetConfig,
      ...(label.includes("minimal") ? { smoothingMs: 40 } : {}),
    },
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
