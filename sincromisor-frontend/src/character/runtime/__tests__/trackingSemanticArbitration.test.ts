import { describe, expect, it } from "vitest";
import { finalPoseAngleRad } from "../../motionEvaluation/motionFinalPoseMetrics";
import {
    createHand,
    createIntent,
    createProfile,
} from "../../motionIntent/__tests__/fingerCurlPoseLayerTestFixtures";
import { NEUTRAL_POSE_FRAME } from "../../retargeting/sincroPoseRetargetTypes";
import { createDefaultTemporalUpperBodyState } from "../../temporal/temporalUpperBodyState";
import { trackingProtectionWeight } from "../../vrmPose/vrmPoseSemanticPolicy";
import { SincroVrmPoseComposerService } from "../sincroVrmPoseComposer";

function compose(confidence: number, intent = createIntent("pointing"), age = 0) {
    const frame = structuredClone(NEUTRAL_POSE_FRAME);
    frame.active = true;
    frame.confidence = 1;
    frame.leftArm.active = true;
    frame.rightArm.active = true;
    frame.leftArm.trackingWeight = 1;
    frame.rightArm.trackingWeight = 1;
    const temporal = createDefaultTemporalUpperBodyState(1000);
    temporal.arms.left.confidence = confidence;
    temporal.arms.right.confidence = 1;
    return new SincroVrmPoseComposerService().compose({
        frame,
        profile: createProfile(),
        semanticFinger: {
            mode: "composer",
            intent,
            hand: createHand({ index: 0.8 }),
            mediaTimeMs: 1000,
            poseMediaTimeMs: 1000 + age,
            temporal,
        },
    });
}

describe("観測と補助姿勢の調停", () => {
    it("新鮮な高信頼観測は保護し、期限を過ぎると連続して保護を弱める", () => {
        const weight = (age: number) =>
            trackingProtectionWeight({
                id: "tracking",
                kind: "tracking",
                blendMode: "override",
                weight: 1,
                pose: {},
                ownedBones: [],
                metadata: { tracking: { confidence: 1, observedAgeMs: age } },
            });
        expect(weight(0)).toBe(1);
        expect(weight(100)).toBe(1);
        expect(weight(250)).toBe(1);
        expect(weight(251)).toBeCloseTo(1, 2);
        expect(weight(475)).toBeCloseTo(0.5);
        expect(weight(700)).toBe(0);
    });
    it("高信頼の同じ観測では意図を替えても腕と指が変わらない", () => {
        const tracking = compose(1, createIntent("tracking"));
        for (const intent of ["pointing", "peace", "thumbsUp", "wave"] as const) {
            const actual = compose(1, createIntent(intent));
            expect(actual.result?.finalPose).toEqual(tracking.result?.finalPose);
            expect(
                actual.result?.suppressedLayers.some((s) => s.reason === "semantic_conflict"),
            ).toBe(true);
        }
    });
    it("片側の品質不足だけを補い、閾値を往復しても重みが飛ばない", () => {
        const tracked = compose(1),
            missing = compose(0);
        expect(missing.result?.finalPose.rightUpperArm).toEqual(
            tracked.result?.finalPose.rightUpperArm,
        );
        expect(missing.result?.finalPose.leftUpperArm).not.toEqual(
            tracked.result?.finalPose.leftUpperArm,
        );
        const low = compose(0.649).result?.finalPose.leftUpperArm;
        const high = compose(0.651).result?.finalPose.leftUpperArm;
        if (!low || !high) throw new Error("Missing final arm");
        expect(finalPoseAngleRad(low, high)).toBeLessThan(0.01);
    });
    it("古い意図と明示停止では欠損部位の補助姿勢も復活させない", () => {
        const expired = compose(0, createIntent("pointing"), 300);
        const plain = compose(0, createIntent("tracking"), 300);
        expect(expired.result?.finalPose).toEqual(plain.result?.finalPose);
        const service = new SincroVrmPoseComposerService();
        const profile = createProfile();
        const active = {
            mode: "composer" as const,
            intent: createIntent("pointing"),
            hand: createHand({ index: 0.8 }),
            mediaTimeMs: 1000,
            poseMediaTimeMs: 1000,
        };
        service.compose({ frame: NEUTRAL_POSE_FRAME, profile, semanticFinger: active });
        service.reset();
        const stopped = service.compose({
            frame: NEUTRAL_POSE_FRAME,
            profile,
            semanticFinger: { ...active, trackingEnabled: false, hand: undefined },
        });
        expect(stopped.result?.finalPose.leftIndexProximal).toEqual({ x: 0, y: 0, z: 0, w: 1 });
        expect(stopped.result?.suppressedLayers.some((s) => s.reason === "zero_weight")).toBe(true);
    });
});
