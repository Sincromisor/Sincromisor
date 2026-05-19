import type { VRM, VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroFaceRetargetFrame } from "../retargeting/sincroFaceRetargeter";
import {
    type CharacterMotionTuning,
    DEFAULT_CHARACTER_MOTION_TUNING,
} from "../vrmCharacter/characterMotionConfig";
import type { CharacterBehaviorSnapshot } from "./characterBehaviorState";
import {
    createEyeTargetRuntimeState,
    type EyeTargetRuntimeState,
    updateEyeTarget,
} from "./eyeBehaviorTarget";
import {
    BLINK_PRESETS,
    EYE_BEHAVIOR_CONFIG,
    type EyeBone,
    type EyeBoneName,
    type EyeTarget,
    LOOK_PRESETS,
} from "./eyeBehaviorValues";
import { EyeBlinkController } from "./eyeBlinkController";

// 目線、まばたき、短い視線外しをまとめる controller。
// 標準look expressionを優先し、未実装モデルでは左右eyeボーンへフォールバックする。
export class EyeBehaviorController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly eyeBones = new Map<EyeBoneName, EyeBone>();
    private readonly availableLookPresets = new Set<VRMExpressionPresetName>();
    private readonly blinkController: EyeBlinkController;
    private smoothedTarget: EyeTarget = { x: 0.5, y: 0.5 };
    private readonly targetRuntime: EyeTargetRuntimeState = createEyeTargetRuntimeState();
    private lastUpdateAtMs: number | undefined;
    private tuning: CharacterMotionTuning = DEFAULT_CHARACTER_MOTION_TUNING;

    constructor(vrm: VRM, expressionManager: VRMExpressionManager) {
        this.expressionManager = expressionManager;
        const availableBlinkPresets = new Set<VRMExpressionPresetName>();
        for (const preset of LOOK_PRESETS) {
            const expression = this.expressionManager.getExpression(preset) ?? undefined;
            if (expression !== undefined) {
                this.availableLookPresets.add(preset);
            }
        }
        for (const preset of BLINK_PRESETS) {
            const expression = this.expressionManager.getExpression(preset) ?? undefined;
            if (expression !== undefined) {
                availableBlinkPresets.add(preset);
            }
        }
        this.blinkController = new EyeBlinkController(expressionManager, availableBlinkPresets);
        this.captureEyeBone(vrm, "leftEye");
        this.captureEyeBone(vrm, "rightEye");
    }

    update(snapshot: CharacterBehaviorSnapshot, sincroFace?: SincroFaceRetargetFrame): void {
        const nowMs = snapshot.nowMs;
        const deltaMs =
            this.lastUpdateAtMs === undefined
                ? 1000 / 60
                : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 100);
        this.lastUpdateAtMs = nowMs;
        if (
            snapshot.motionPolicy.allowFaceRetarget &&
            snapshot.faceMotion.trackingEnabled &&
            sincroFace
        ) {
            this.applySincroFaceMotion(sincroFace);
            return;
        }

        const target = updateEyeTarget({
            snapshot,
            nowMs,
            state: this.targetRuntime,
        });
        const timeConstantMs = snapshot.gaze.detected
            ? EYE_BEHAVIOR_CONFIG.smoothingTimeConstantMs
            : EYE_BEHAVIOR_CONFIG.fallbackSmoothingTimeConstantMs;
        const alpha = 1 - Math.exp(-deltaMs / timeConstantMs);
        this.smoothedTarget.x += (target.x - this.smoothedTarget.x) * alpha;
        this.smoothedTarget.y += (target.y - this.smoothedTarget.y) * alpha;

        const offsetX =
            MathUtils.clamp(this.smoothedTarget.x - 0.5, -0.5, 0.5) * this.tuning.eyeTrackingScale;
        const offsetY =
            MathUtils.clamp(this.smoothedTarget.y - 0.5, -0.5, 0.5) * this.tuning.eyeTrackingScale;
        this.applyLook(offsetX, offsetY);
        this.blinkController.apply(snapshot, nowMs);
    }

    setTuning(partial: Partial<CharacterMotionTuning>): void {
        this.tuning = {
            ...this.tuning,
            ...partial,
        };
    }

    private captureEyeBone(vrm: VRM, name: EyeBoneName): void {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) {
            return;
        }
        this.eyeBones.set(name, {
            node,
            baseRotation: node.rotation.clone(),
        });
    }

    private applyLook(offsetX: number, offsetY: number): void {
        const hasHorizontalLookExpression =
            this.availableLookPresets.has("lookLeft") || this.availableLookPresets.has("lookRight");
        const hasVerticalLookExpression =
            this.availableLookPresets.has("lookUp") || this.availableLookPresets.has("lookDown");
        if (hasHorizontalLookExpression || hasVerticalLookExpression) {
            this.applyLookExpressions(
                hasHorizontalLookExpression ? offsetX : 0,
                hasVerticalLookExpression ? offsetY : 0,
            );
        }
        if (!hasHorizontalLookExpression || !hasVerticalLookExpression) {
            this.applyEyeBoneRotation(
                hasHorizontalLookExpression ? 0 : offsetX,
                hasVerticalLookExpression ? 0 : offsetY,
            );
        }
    }

    private applyLookExpressions(offsetX: number, offsetY: number): void {
        for (const preset of LOOK_PRESETS) {
            this.setExpressionIfAvailable(preset, 0);
        }
        this.setExpressionIfAvailable(
            "lookLeft",
            MathUtils.clamp(-offsetX * EYE_BEHAVIOR_CONFIG.expressionHorizontalScale, 0, 1),
        );
        this.setExpressionIfAvailable(
            "lookRight",
            MathUtils.clamp(offsetX * EYE_BEHAVIOR_CONFIG.expressionHorizontalScale, 0, 1),
        );
        this.setExpressionIfAvailable(
            "lookUp",
            MathUtils.clamp(offsetY * EYE_BEHAVIOR_CONFIG.expressionVerticalScale, 0, 1),
        );
        this.setExpressionIfAvailable(
            "lookDown",
            MathUtils.clamp(-offsetY * EYE_BEHAVIOR_CONFIG.expressionVerticalScale, 0, 1),
        );
    }

    private applyEyeBoneRotation(offsetX: number, offsetY: number): void {
        for (const bone of this.eyeBones.values()) {
            bone.node.rotation.set(
                bone.baseRotation.x + offsetY * EYE_BEHAVIOR_CONFIG.maxVerticalRad * 2,
                bone.baseRotation.y - offsetX * EYE_BEHAVIOR_CONFIG.maxHorizontalRad * 2,
                bone.baseRotation.z,
            );
        }
    }

    private applySincroFaceMotion(sincroFace: SincroFaceRetargetFrame): void {
        const expressions = sincroFace.expressions;
        for (const preset of LOOK_PRESETS) {
            this.setExpressionIfAvailable(preset, 0);
        }
        this.setExpressionIfAvailable("lookLeft", expressions.lookLeft);
        this.setExpressionIfAvailable("lookRight", expressions.lookRight);
        this.setExpressionIfAvailable("lookUp", expressions.lookUp);
        this.setExpressionIfAvailable("lookDown", expressions.lookDown);
        this.blinkController.applyExpressions(expressions.blinkLeft, expressions.blinkRight);

        const offsetX = MathUtils.clamp(
            (expressions.lookRight - expressions.lookLeft) * 0.42,
            -0.5,
            0.5,
        );
        const offsetY = MathUtils.clamp(
            (expressions.lookUp - expressions.lookDown) * 0.36,
            -0.5,
            0.5,
        );
        const lookExpressionCoversHorizontal =
            this.availableLookPresets.has("lookLeft") || this.availableLookPresets.has("lookRight");
        const lookExpressionCoversVertical =
            this.availableLookPresets.has("lookUp") || this.availableLookPresets.has("lookDown");
        this.applySincroEyeBoneFallback(
            lookExpressionCoversHorizontal ? 0 : offsetX,
            lookExpressionCoversVertical ? 0 : offsetY,
            this.blinkController.hasAvailablePresets() ? 0 : expressions.blinkLeft,
            this.blinkController.hasAvailablePresets() ? 0 : expressions.blinkRight,
        );
    }

    private applySincroEyeBoneFallback(
        offsetX: number,
        offsetY: number,
        blinkLeft: number,
        blinkRight: number,
    ): void {
        for (const [name, bone] of this.eyeBones) {
            const blink = name === "leftEye" ? blinkLeft : blinkRight;
            bone.node.rotation.set(
                bone.baseRotation.x +
                    offsetY * EYE_BEHAVIOR_CONFIG.maxVerticalRad * 2 +
                    blink * MathUtils.degToRad(9),
                bone.baseRotation.y - offsetX * EYE_BEHAVIOR_CONFIG.maxHorizontalRad * 2,
                bone.baseRotation.z,
            );
        }
    }

    private setExpressionIfAvailable(preset: VRMExpressionPresetName, value: number): void {
        if (!this.availableLookPresets.has(preset)) {
            return;
        }
        this.expressionManager.setValue(preset, value);
    }
}
