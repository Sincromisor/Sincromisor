// リポジトリルートから実行する。起票時の不整合を合成入力で確認する調査用スクリプト。
import { createServer } from "../../../../sincromisor-frontend/node_modules/vite/dist/node/index.js";

const server = await createServer({
	root: new URL("../../../../sincromisor-frontend", import.meta.url).pathname,
	configFile: false,
	server: { middlewareMode: true, watch: null, hmr: false, ws: false },
	appType: "custom",
	logLevel: "error",
});
try {
	const get = (p) => server.ssrLoadModule(`/src/${p}`);
	const { createDefaultTemporalUpperBodyState } = await get(
		"character/temporal/temporalUpperBodyState.ts",
	);
	const { createTemporalArmIkInput } = await get(
		"character/motionSolver/temporalArmSolverBridge.ts",
	);
	const { toMinimalAvatarMotionProfile } = await get(
		"character/avatarProfile/avatarMotionProfileClone.ts",
	);
	const f = await get(
		"character/motionIntent/__tests__/fingerCurlPoseLayerTestFixtures.ts",
	);
	const { createFingerCurlPoseLayer } = await get(
		"character/motionIntent/fingerCurlPoseLayer.ts",
	);
	const temporal = createDefaultTemporalUpperBodyState(1000);
	Object.assign(temporal.arms.right, {
		state: "tracked",
		confidence: 1,
		reach: 0.7,
		bodyLocalWrist: [0.6, -0.4, 0.2],
		bodyLocalElbow: [0.55, -0.2, 0.1],
	});
	const profile = toMinimalAvatarMotionProfile(f.createProfile());
	const solver = {
		shoulderWidth: 0.32,
		upperArmLength: 0.24,
		lowerArmLength: 0.22,
	};
	const a = createTemporalArmIkInput({
		temporal,
		side: "right",
		profile,
		solver,
	});
	const big = structuredClone(profile);
	for (const key of Object.keys(big.measurements))
		if (typeof big.measurements[key] === "number") big.measurements[key] *= 2;
	const b = createTemporalArmIkInput({
		temporal,
		side: "right",
		profile: big,
		solver: { shoulderWidth: 0.64, upperArmLength: 0.48, lowerArmLength: 0.44 },
	});
	console.log(
		JSON.stringify({
			probe: "uniform_avatar_scale",
			directionAngleDeg:
				(a.target.wrist.angleTo(b.target.wrist) * 180) / Math.PI,
			original: a.target.wrist.toArray(),
			doubled: b.target.wrist.toArray(),
		}),
	);
	const hand = f.createHand();
	for (const side of ["leftHand", "rightHand"])
		for (const group of Object.keys(hand[side].features.fingerCurl))
			hand[side].features.fingerCurl[group] = undefined;
	const intent = f.createIntent();
	let previous = f.previousDebug("left", 0, 0.8);
	const profile2 = f.createProfile();
	for (let t = 100; t <= 1000; t += 100)
		previous = createFingerCurlPoseLayer({
			side: "left",
			hand,
			intent,
			profile: profile2,
			mediaTimeMs: t,
			previous,
		}).debug;
	console.log(
		JSON.stringify({
			probe: "missing_finger_after_1000ms",
			group: previous.groups.find((x) => x.group === "index"),
			timestamp: previous.timestamp,
		}),
	);
	const { TemporalStateEstimator } = await get(
		"character/temporal/temporalStateEstimator.ts",
	);
	const estimator = new TemporalStateEstimator();
	const canonical = {
		timestamp: { mediaTimeMs: 0, poseLastUpdatedAtMs: 0 },
		arms: {
			left: { ...temporal.arms.right },
			right: { ...temporal.arms.right },
		},
	};
	for (const side of ["left", "right"])
		Object.assign(canonical.arms[side], {
			confidence: 1,
			reach: 0.7,
			source: "pose",
		});
	estimator.update({ canonical, mediaTimeMs: 0 });
	canonical.arms.right.confidence = 0;
	const lost = estimator.update({ canonical, mediaTimeMs: 100 });
	const predicted = createTemporalArmIkInput({
		temporal: lost,
		side: "right",
		profile,
		solver,
	});
	console.log(
		JSON.stringify({
			probe: "prediction_weight_on_loss",
			state: lost.arms.right.state,
			confidence: lost.arms.right.confidence,
			weight: predicted.target?.weight,
		}),
	);
	const { estimateCanonicalTorsoFrame } = await get(
		"character/canonical/canonicalTorsoFrameEstimator.ts",
	);
	const snapshots = await get(
		"features/gaze/poseTracking/sincroPoseMotionSnapshot.ts",
	);
	const pose = structuredClone(snapshots.DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT);
	const point = (p) => ({
		...structuredClone(snapshots.DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT),
		world: {
			hasWorldCoordinates: true,
			worldConfidence: 1,
			normalizedX: p[0],
			normalizedY: p[1],
			normalizedZ: p[2],
		},
	});
	pose.leftArm.targets.shoulder = point([-0.5, 1, 0]);
	pose.rightArm.targets.shoulder = point([0.5, 1, 0]);
	pose.lowerBodyTargets.leftHip = point([-0.7, 0, 0]);
	pose.lowerBodyTargets.rightHip = point([0.3, 0, 0]);
	pose.upperBody.hipCenterTracked = true;
	const torso = estimateCanonicalTorsoFrame({ pose, mediaTimeMs: 0 }).torso;
	console.log(
		JSON.stringify({
			probe: "torso_basis",
			rightDotUp: torso.bodyRight.reduce(
				(s, v, i) => s + v * torso.bodyUp[i],
				0,
			),
		}),
	);
	const { normalizeSincroPoseLandmarkerResult } = await get(
		"features/gaze/poseTracking/sincroPoseTrackerNormalizer.ts",
	);
	const landmarks = Array.from({ length: 33 }, () => ({
		x: 0.5,
		y: 0.5,
		z: 0,
		visibility: 1,
		presence: 1,
	}));
	const world = Array.from({ length: 33 }, () => ({
		x: 0,
		y: 0,
		z: 0,
		visibility: 1,
		presence: 1,
	}));
	const set = (i, p) => {
		Object.assign(world[i], { x: p[0], y: p[1], z: p[2] });
		Object.assign(landmarks[i], {
			x: 0.5 + p[0] / 2,
			y: 0.5 + p[1] / 2,
			z: p[2],
		});
	};
	set(11, [-0.2, -0.5, 0]);
	set(12, [0.2, -0.5, 0]);
	set(13, [-0.35, -0.25, 0]);
	set(14, [0.35, -0.25, 0]);
	set(15, [-0.4, 0, 0.1]);
	set(16, [0.4, 0, 0.1]);
	set(23, [-0.15, 0, 0]);
	set(24, [0.15, 0, 0]);
	const normalized = normalizeSincroPoseLandmarkerResult({
		result: { landmarks: [landmarks], worldLandmarks: [world] },
		inferenceTimeMs: 0,
		inferenceFps: 30,
		nowMs: 1000,
		consecutiveFailures: 0,
	}).snapshot;
	const derived = estimateCanonicalTorsoFrame({
		pose: normalized,
		mediaTimeMs: 1000,
	}).torso;
	console.log(
		JSON.stringify({
			probe: "production_normalizer_torso",
			shoulderCenter: derived.shoulderCenter,
			hipCenter: derived.hipCenter,
			source: derived.source,
			confidence: derived.confidence,
			warnings: derived.warnings,
		}),
	);
} finally {
	await server.close();
}
