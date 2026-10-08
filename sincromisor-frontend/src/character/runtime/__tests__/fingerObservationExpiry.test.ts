import { describe, expect, it } from "vitest";
import { createSincroHandFallbackSnapshot } from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    createHand,
    createIntent,
    createProfile,
    groupCurl,
} from "../../motionIntent/__tests__/fingerCurlPoseLayerTestFixtures";
import { observeFingerCurl } from "../../motionIntent/fingerCurlObservation";
import { createFingerCurlPoseLayer } from "../../motionIntent/fingerCurlPoseLayer";
import { NEUTRAL_POSE_FRAME } from "../../retargeting/sincroPoseRetargetTypes";
import { SincroMotionClock } from "../sincroMotionClock";
import { SincroVrmPoseComposerService } from "../sincroVrmPoseComposer";
import {
    createSemanticFingerComposerLayers,
    type SincroVrmPoseComposerSemanticFingerState,
} from "../sincroVrmPoseComposerSemanticFingerLayers";

describe("指の実観測と保持期限", () => {
    it("100ms間隔の欠損で基点を延長せず、左右独立に保持・中立・復帰する", () => {
        let state: SincroVrmPoseComposerSemanticFingerState = { previousFinger: {} };
        const profile = createProfile({ curlScale: 0.5 });
        const observed = createHand({ index: 0.8 });
        const render = (time: number, hand = observed) => {
            const result = createSemanticFingerComposerLayers(
                profile,
                { mode: "composer", hand, intent: createIntent(), mediaTimeMs: time },
                state,
            );
            state = { previousFinger: result.previousFinger };
            return result.layers.find((layer) => layer.id === "finger-curl:left")?.pose
                .leftIndexProximal;
        };
        const original = render(1000);
        for (let time = 1100; time <= 2000; time += 100) {
            const hand = createHand({ index: 0.8 });
            hand.lastUpdatedAtMs = time;
            hand.leftHand.detected = false;
            const pose = render(time, hand);
            expect(state.previousFinger.left?.observedAtMs).toBe(1000);
            expect(state.previousFinger.right?.observedAtMs).toBe(time);
            expect(pose).toEqual(time <= 1250 ? original : { x: 0, y: 0, z: 0, w: 1 });
        }
        const recovered = createHand({ index: 0.8 });
        recovered.lastUpdatedAtMs = 2100;
        expect(render(2100, recovered)).toEqual(original);
    });

    it("有限な低信頼・誤割当・保持済み入力を実観測に採用しない", () => {
        for (const variant of ["confidence", "side", "source", "time", "detected"] as const) {
            const hand = createHand({ index: 0.8 });
            if (variant === "confidence") hand.leftHand.confidence = 0.1;
            if (variant === "side") hand.leftHand.assignedSide = "right";
            if (variant === "source") hand.leftHand.source = "previous";
            if (variant === "time") hand.lastUpdatedAtMs = Number.NaN;
            if (variant === "detected") hand.detected = false;
            expect(observeFingerCurl(hand, "left", hand.lastUpdatedAtMs, 1000)).toBeUndefined();
        }
    });

    it("時計の原点を変換し、Pose・意図の無到着でも期限が進み、再生停止中は進まない", () => {
        const clock = new SincroMotionClock();
        clock.receive("hand", { mediaTimeMs: 1000, receivedAtPerformanceMs: 90000 });
        const service = new SincroVrmPoseComposerService();
        const hand = createHand({ index: 0.8 });
        const render = (now: number) =>
            service.compose({
                frame: NEUTRAL_POSE_FRAME,
                profile: createProfile(),
                mediaTimeMs: now,
                semanticFinger: {
                    mode: "composer",
                    intent: createIntent(),
                    hand,
                    mediaTimeMs: clock.evaluate(now).handTimeMs,
                },
            });
        const original = render(90000).result?.finalPose.leftIndexProximal;
        expect(render(90200).result?.finalPose.leftIndexProximal).toEqual(original);
        expect(render(90300).result?.finalPose.leftIndexProximal).toEqual({
            x: 0,
            y: 0,
            z: 0,
            w: 1,
        });
        clock.setReplayTime(1100);
        expect(render(99900).result?.finalPose.leftIndexProximal).toEqual(original);
        expect(render(999999).result?.finalPose.leftIndexProximal).toEqual(original);
    });

    it("同時刻の出力を観測へ戻さず、停止とresetで履歴を捨てる", () => {
        const hand = createHand({ index: 0.8 });
        const previous = observeFingerCurl(hand, "left", 1000, 1000);
        const input = {
            side: "left" as const,
            hand,
            intent: createIntent(),
            profile: createProfile({ curlScale: 0.5 }),
            mediaTimeMs: 1100,
            previous,
        };
        expect(groupCurl(createFingerCurlPoseLayer(input).debug, "index")).toBe(0.4);
        expect(observeFingerCurl(hand, "left", 1000, 1100, previous)).toBe(previous);
        hand.trackingEnabled = false;
        expect(observeFingerCurl(hand, "left", 1100, 1100, previous)).toBeUndefined();
        const service = new SincroVrmPoseComposerService();
        const compose = (handInput = createHand({ index: 0.8 })) =>
            service.compose({
                frame: NEUTRAL_POSE_FRAME,
                profile: createProfile(),
                semanticFinger: {
                    mode: "composer",
                    hand: handInput,
                    intent: createIntent(),
                    mediaTimeMs: 1100,
                },
            });
        compose();
        service.reset();
        expect(
            compose(createSincroHandFallbackSnapshot({ nowMs: 1100 })).result?.finalPose
                .leftIndexProximal,
        ).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    });
});
