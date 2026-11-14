import type { VRM } from "@pixiv/three-vrm";
import { Vector3 } from "three";
import { EyeBehaviorController } from "../behavior/eyeBehaviorController";
import { FaceEmotionController } from "../behavior/faceEmotionController";
import { FaceMorphController } from "../behavior/faceMorphController";
import { HeadBoneController } from "../behavior/headBoneController";
import {
    type SincroPoseRetargetConfig,
    SincroPoseRetargeter,
} from "../retargeting/sincroPoseRetargeter";
import { SincroVrmPoseComposerService } from "../runtime/sincroVrmPoseComposer";
import type { VRMCamera } from "../scene/vrmCamera";
import { ArmBoneController } from "./armBoneController";
import type { CharacterMotionTuning } from "./characterMotionConfig";
import { CharacterRootStabilizer } from "./characterRootStabilizer";
import { LegBoneController } from "./legBoneController";
import type { VRMDiagnostics } from "./vrmDiagnostics";

type RuntimeOptions = {
    vrm: VRM;
    camera: VRMCamera;
    config: Partial<SincroPoseRetargetConfig>;
    tuning: Partial<CharacterMotionTuning>;
    elapsedSeconds: number;
    diagnostics?: VRMDiagnostics;
};

/** 候補モデル専用の制御処理を作る。途中で失敗しても表示中の制御処理を変更しない。 */
export function createVrmModelRuntime(options: RuntimeOptions) {
    const { vrm, camera } = options;
    const sincroPoseRetargeter = new SincroPoseRetargeter(options.config);
    sincroPoseRetargeter.attachVrm(vrm);
    const armBoneController = new ArmBoneController(vrm);
    armBoneController.update(options.elapsedSeconds);
    const legBoneController = new LegBoneController(vrm);
    legBoneController.update(options.elapsedSeconds);
    const rootBone = vrm.humanoid.getNormalizedBoneNode("hips") ?? undefined;
    const expression = vrm.expressionManager;
    const eyeBehaviorController = expression
        ? new EyeBehaviorController(vrm, expression)
        : undefined;
    eyeBehaviorController?.setTuning(options.tuning);
    return {
        vrm,
        headBoneController: new HeadBoneController(vrm, camera),
        armBoneController,
        legBoneController,
        rootBone,
        defaultPosition: rootBone?.position.clone() ?? new Vector3(),
        rootStabilizer: new CharacterRootStabilizer(rootBone),
        sincroPoseRetargeter,
        poseComposer: new SincroVrmPoseComposerService(),
        mouthMorphController: expression ? new FaceMorphController(expression) : undefined,
        emotionMorphController: expression
            ? new FaceEmotionController(expression, options.diagnostics?.onEmotionLog)
            : undefined,
        eyeBehaviorController,
    };
}
