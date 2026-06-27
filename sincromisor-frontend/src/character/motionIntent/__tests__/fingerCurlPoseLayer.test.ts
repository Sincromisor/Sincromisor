import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { describe, expect, it } from "vitest";
import { createFingerCurlPoseLayer } from "../fingerCurlPoseLayer";
import {
    angleFromIdentity,
    createHand,
    createIntent,
    createProfile,
    emptyFingerChains,
    groupCurl,
    PROFILE,
    previousDebug,
    setAllCurls,
} from "./fingerCurlPoseLayerTestFixtures";

describe("createFingerCurlPoseLayer", () => {
    it("falls back from missing curl to openness and side-matched previous only", () => {
        const hand = createHand();
        setAllCurls(hand.leftHand.features, Number.NaN);
        hand.leftHand.features.openness = "unknown";

        const result = createFingerCurlPoseLayer({
            side: "left",
            hand,
            intent: createIntent(),
            profile: PROFILE,
            mediaTimeMs: 1100,
            previous: previousDebug("left", 900, 0.42),
        });
        const sideMismatch = createFingerCurlPoseLayer({
            side: "left",
            hand,
            intent: createIntent(),
            profile: PROFILE,
            mediaTimeMs: 1100,
            previous: previousDebug("right", 900, 0.9),
        });

        expect(result.debug.groups.every((group) => group.source === "previous")).toBe(true);
        expect(result.debug.groups[0]?.curl).toBe(0.42);
        expect(sideMismatch.debug.groups.every((group) => group.source === "default")).toBe(true);

        hand.leftHand.features.openness = "half";
        const openness = createFingerCurlPoseLayer({
            side: "left",
            hand,
            intent: createIntent(),
            profile: PROFILE,
            mediaTimeMs: 1300,
        });
        expect(openness.debug.groups[0]).toMatchObject({ curl: 0.55, source: "openness" });
    });

    it("applies semantic intent overrides without replacing tracking hand curl", () => {
        const pointingHand = createHand({ thumb: 0, index: 1, middle: 0, ring: 0, little: 0 });
        const pointing = createFingerCurlPoseLayer({
            side: "left",
            hand: pointingHand,
            intent: createIntent("pointing"),
            profile: PROFILE,
            mediaTimeMs: 1000,
        });
        const tracking = createFingerCurlPoseLayer({
            side: "left",
            hand: pointingHand,
            intent: createIntent("tracking"),
            profile: PROFILE,
            mediaTimeMs: 1000,
        });

        expect(groupCurl(pointing.debug, "thumb")).toBeGreaterThanOrEqual(0.35);
        expect(groupCurl(pointing.debug, "index")).toBeLessThanOrEqual(0.15);
        expect(groupCurl(pointing.debug, "middle")).toBeGreaterThanOrEqual(0.75);
        expect(groupCurl(pointing.debug, "ringLittle")).toBeGreaterThanOrEqual(0.75);
        expect(pointing.debug.groups.every((group) => group.source === "intent")).toBe(true);
        expect(groupCurl(tracking.debug, "index")).toBe(1);
        expect(groupCurl(tracking.debug, "middle")).toBe(0);
    });

    it("applies profile curlScale before writing debug curl and pose", () => {
        const result = createFingerCurlPoseLayer({
            side: "left",
            hand: createHand({ index: 0.8 }),
            intent: createIntent(),
            profile: createProfile({ curlScale: 0.5 }),
            mediaTimeMs: 1000,
        });

        expect(groupCurl(result.debug, "index")).toBe(0.4);
        expect(angleFromIdentity(result.layer?.pose.leftIndexProximal)).toBeCloseTo(
            MathUtils.degToRad(70 * 0.4 * 0.5),
            6,
        );
    });

    it("defaults invalid curl distribution and records a warning", () => {
        const result = createFingerCurlPoseLayer({
            side: "left",
            hand: createHand({ index: 1 }),
            intent: createIntent(),
            profile: createProfile({
                curlDistribution: { proximal: 0.2, intermediate: 0.2, distal: 0.2 },
            }),
            mediaTimeMs: 1000,
        });

        expect(result.debug.warnings).toContain(
            "invalid_finger_curl_distribution_profile_defaulted",
        );
        expect(angleFromIdentity(result.layer?.pose.leftIndexProximal)).toBeCloseTo(
            MathUtils.degToRad(35),
            6,
        );
    });

    it("redistributes missing distal curl over the available chain weights", () => {
        const profile = createProfile();
        profile.capabilities.fingerChains.left.index.distal = false;
        const result = createFingerCurlPoseLayer({
            side: "left",
            hand: createHand({ index: 1 }),
            intent: createIntent(),
            profile,
            mediaTimeMs: 1000,
        });

        expect(result.layer?.pose.leftIndexDistal).toBeUndefined();
        expect(angleFromIdentity(result.layer?.pose.leftIndexProximal)).toBeCloseTo(
            MathUtils.degToRad(70 * 0.625),
            6,
        );
        expect(angleFromIdentity(result.layer?.pose.leftIndexIntermediate)).toBeCloseTo(
            MathUtils.degToRad(70 * 0.375),
            6,
        );
    });

    it("returns only debug and warnings when all finger chains are missing", () => {
        const result = createFingerCurlPoseLayer({
            side: "left",
            hand: createHand({ index: 1 }),
            intent: createIntent(),
            profile: createProfile({ chains: emptyFingerChains() }),
            mediaTimeMs: 1000,
        });

        expect(result.layer).toBeUndefined();
        expect(result.debug.ownedBones).toEqual([]);
        expect(result.debug.warnings).toEqual([
            "missing_finger_chain:left:thumb",
            "missing_finger_chain:left:index",
            "missing_finger_chain:left:middle",
            "missing_finger_chain:left:ringLittle",
        ]);
    });

    it("owns only finger bones and stores plain quaternion objects", () => {
        const result = createFingerCurlPoseLayer({
            side: "left",
            hand: createHand({ thumb: 0.7, index: 0.4, middle: 0.3, ring: 0.2, little: 0.1 }),
            intent: createIntent("explain"),
            profile: PROFILE,
            mediaTimeMs: 1000,
        });

        expect(result.layer?.id).toBe("finger-curl:left");
        expect(result.layer?.kind).toBe("semantic");
        expect(result.layer?.blendMode).toBe("additive");
        expect(result.layer?.ownedBones).not.toContain("leftUpperArm");
        expect(result.layer?.ownedBones).not.toContain("leftLowerArm");
        expect(result.layer?.ownedBones).not.toContain("leftHand");
        expect(result.layer?.ownedBones).not.toContain("spine");
        expect(result.layer?.ownedBones).not.toContain("head");
        expect(result.layer?.ownedBones.every((bone) => bone.startsWith("left"))).toBe(true);
        expect(result.layer?.pose.leftIndexProximal).not.toBeInstanceOf(Quaternion);
    });
});
