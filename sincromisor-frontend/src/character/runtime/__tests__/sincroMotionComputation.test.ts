import { expect, it } from "vitest";
import type { SincroAppEvent } from "../../../app/controller/sincroAppTypes";
import { SincroCharacterMotionEventSink } from "../../../app/controller/sincroCharacterMotionEventSink";
import { SincroAppSettingsModel } from "../../../app/settings/sincroAppSettingsModel";
import { ChatMessageService } from "../../../features/conversation/chat/model/chatMessageService";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT } from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import { DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT } from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import { CharacterBehaviorState } from "../../behavior/characterBehaviorState";
import { createCanonicalUpperBodyState } from "../../canonical/canonicalArmFeatureExtractor";
import { estimateCanonicalTorsoFrame } from "../../canonical/canonicalTorsoFrameEstimator";
import type { CanonicalUpperBodyState } from "../../canonical/canonicalUpperBodyState";
import { MotionIntentEstimator } from "../../motionIntent/motionIntentEstimator";
import {
    createPoint,
    createPose,
} from "../../reliability/__tests__/poseReliabilityEstimatorFixtures";
import { TemporalStateEstimator } from "../../temporal/temporalStateEstimator";
import { SincroMotionObserveOnlyPipeline } from "../sincroMotionObserveOnlyPipeline";

it("固定入力の抽出前の計算順と一致し、Pose以外で時系列と意図を進めない", () => {
    const pipeline = new SincroMotionObserveOnlyPipeline();
    const face = DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT;
    const hand = DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT;
    const poses = [
        createPose(),
        createPose({ leftWrist: createPoint([0.4, 0.2], [-0.7, 0.5, 0.1]) }),
        createPose({ detected: false }),
    ];
    // 既存の計算部品を抽出前と同じ順で呼び、共通実装の順序・入力・初期化を照合する。
    for (let pass = 0; pass < 2; pass++) {
        pipeline.reset();
        const temporalEstimator = new TemporalStateEstimator();
        const intentEstimator = new MotionIntentEstimator();
        let previous: CanonicalUpperBodyState | undefined;
        pipeline.updateFace(face, { mediaTimeMs: 0, receivedAtMs: 0 });
        pipeline.updateHand(hand, { mediaTimeMs: 0, receivedAtMs: 0 });
        for (const [index, pose] of poses.entries()) {
            const mediaTimeMs = 100 + index * 100;
            const input = {
                mediaTimeMs,
                receivedAtMs: mediaTimeMs,
                video: { width: 640, height: 480 },
            };
            const actual = pipeline.updatePose(pose, input);
            const reliability = actual.state.reliability;
            const canonicalInput = { pose, face, previous, mediaTimeMs, reliability };
            const canonical = createCanonicalUpperBodyState({
                ...canonicalInput,
                torso: estimateCanonicalTorsoFrame(canonicalInput),
            });
            const temporal = temporalEstimator.update({ canonical, reliability, mediaTimeMs });
            const intent = intentEstimator.update({ temporal, reliability, hand, mediaTimeMs });
            expect(actual.state).toMatchObject({ canonical, temporal, intent });
            for (const stage of ["canonical", "temporal", "intent"] as const) {
                expect(actual.summary[stage]).toMatchObject({
                    status: "available",
                    warnings: actual.state[stage]?.warnings,
                });
            }
            previous = canonical;
            for (const update of [
                () => pipeline.updateFace(face, input),
                () => pipeline.updateHand(hand, input),
            ]) {
                const observation = update();
                const observationInput = {
                    ...canonicalInput,
                    previous,
                    reliability: observation.state.reliability,
                };
                previous = createCanonicalUpperBodyState({
                    ...observationInput,
                    torso: estimateCanonicalTorsoFrame(observationInput),
                });
                expect(observation.state).toMatchObject({ canonical: previous, temporal, intent });
            }
            const gesture = pipeline.updateGesture(
                {
                    trackingEnabled: false,
                    source: "lost",
                    warnings: [],
                    inferenceTimeMs: 0,
                    inferenceFps: 0,
                    lastUpdatedAtMs: mediaTimeMs,
                },
                input,
            );
            expect(gesture.state).toMatchObject({ canonical: previous, temporal, intent });
        }
    }
});

it("本番イベント窓口から振る舞い状態へ同じ計算結果を渡し、初期化する", () => {
    const settingsModel = new SincroAppSettingsModel();
    settingsModel.updateCharacterStatus(true);
    settingsModel.updateSettings({ talkMode: "sincro" });
    const behavior = CharacterBehaviorState.getManager();
    const events: SincroAppEvent[] = [];
    const video = { width: 640, height: 480 };
    const sink = new SincroCharacterMotionEventSink({
        settingsModel,
        characterBehaviorState: behavior,
        debugConsoleManager: DebugConsoleManager.getManager(),
        chatMessageService: ChatMessageService.getService(),
        readVideoSize: () => video,
        readTrackSettings: () => undefined,
        readTrackReadyState: () => undefined,
        emitEvent: (event) => events.push(event),
    });
    const reference = new SincroMotionObserveOnlyPipeline();
    const pose = createPose();
    for (const mediaTimeMs of [100, 200]) {
        sink.handlePoseMotion(pose, {
            mediaTimeMs,
            receivedAtPerformanceMs: mediaTimeMs,
            videoCurrentTimeMs: mediaTimeMs,
            source: "timer",
            droppedPresentedFrames: 0,
        });
        const qualityEvent = [...events]
            .reverse()
            .find((event) => event.type === "camera-quality-changed");
        const expected = reference.updatePose(pose, {
            mediaTimeMs,
            receivedAtMs: mediaTimeMs,
            video,
            cameraQuality: qualityEvent?.quality,
        });
        expect(behavior.getSnapshot(mediaTimeMs).sincroMotionPipeline).toEqual(expected.state);
    }
    sink.resetObserveOnlyPipeline();
    reference.reset();
    expect(behavior.getSnapshot(200).sincroMotionPipeline).toEqual(reference.getState());
});
