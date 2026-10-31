import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { SincroMotionObserveOnlyPipeline } from "../../../../sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline";
import { DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT } from "../../../../sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceMotionSnapshot";
import { DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT } from "../../../../sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../../../sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot";

it("同一合成観測列の局所計測", () => {
	const face = structuredClone(DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT);
	const hand = structuredClone(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT);
	const pose = structuredClone(DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT);
	const gesture = {
		trackingEnabled: true,
		source: "gesture-recognizer" as const,
		warnings: [],
		inferenceTimeMs: 4,
		inferenceFps: 3,
	};
	face.detected = true;
	face.confidence = 0.9;
	pose.detected = true;
	pose.confidence = 0.8;
	const timings: number[] = [];
	const hash = createHash("sha256");
	const run = (capture: boolean) => {
		const pipeline = new SincroMotionObserveOnlyPipeline();
		const start = performance.now();
		for (let i = 0; i < 1000; i++) {
			const input = {
				mediaTimeMs: i * 40,
				receivedAtMs: i * 40,
				video: { width: 640, height: 480 },
			};
			face.lastUpdatedAtMs = input.mediaTimeMs;
			face.headPose.yawDeg = Math.sin(i / 10) * 15;
			pose.lastUpdatedAtMs = input.mediaTimeMs;
			hand.lastUpdatedAtMs = input.mediaTimeMs;
			const results = [
				pipeline.updateFace(face, input),
				pipeline.updatePose(pose, input),
				pipeline.updateHand(hand, input),
				pipeline.updateGesture(gesture, input),
				pipeline.getSummary(),
			];
			if (capture) hash.update(JSON.stringify(results));
		}
		return performance.now() - start;
	};
	run(false);
	for (let i = 0; i < 5; i++) timings.push(run(false));
	run(true);
	writeFileSync(
		`/tmp/observation-performance-${process.env.OBSERVATION_BENCH_PHASE ?? "current"}.json`,
		JSON.stringify(
			{
				hash: hash.digest("hex"),
				timingsMs: timings,
				medianMs: [...timings].sort((a, b) => a - b)[2],
			},
			null,
			2,
		),
	);
}, 60000);
