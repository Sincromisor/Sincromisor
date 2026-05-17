import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import type { Object3D } from "three/src/core/Object3D.js";
import { Euler } from "three/src/math/Euler.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { CharacterGaze } from "../../CharacterGaze/CharacterGaze";
import type { VRMCamera } from "../VRMScene/VRMCamera";
import type { CharacterBehaviorSnapshot } from "./CharacterBehaviorState";
import type { SincroFaceRetargetFrame } from "./SincroFaceRetargeter";

/*
    Humanoid bones
    https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

// 首(neck)ボーンの向きを制御する controller。
// CharacterGaze が使える場合は顔検出ベース、未初期化時はカメラ追従でフォールバックする。
export class HeadBoneController {
    private position: Vector3 = new Vector3(0, 0, 0);
    private rotation: Euler = new Euler(0, 0, 0);
    private scale: Vector3 = new Vector3(1, 1, 1);
    private vrm: VRM;
    private vrmCamera: VRMCamera;
    private headControlNode: Object3D | null;
    private readonly sincroHeadNodes = new Map<SincroHeadBoneName, SincroHeadBone>();
    private characterGaze: CharacterGaze;
    private lastUpdateAtMs: number | null = null;
    private aiSpeechBlend = 0;
    private lastAiSpeechBeatId = 0;
    private aiSpeechBeatStartedAtMs: number | null = null;
    private aiSpeechBeatIntensity = 0;
    private aiSpeechBeatDirection = 1;

    constructor(vrm: VRM, vrmCamera: VRMCamera) {
        this.vrm = vrm;
        this.vrmCamera = vrmCamera;
        this.headControlNode = this.getHeadControlNode();
        this.captureSincroHeadBones();
        this.characterGaze = CharacterGaze.getManager();
    }

    // 毎フレームの首向き更新。検出可否に応じて gaze / camera fallback を切り替える。
    update(snapshot?: CharacterBehaviorSnapshot, sincroFace?: SincroFaceRetargetFrame): void {
        if (!this.headControlNode) {
            return;
        }
        const nowMs = snapshot?.nowMs ?? performance.now();
        const deltaMs =
            this.lastUpdateAtMs == null
                ? 1000 / 60
                : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 100);
        this.lastUpdateAtMs = nowMs;
        if (
            snapshot?.motionPolicy.allowFaceRetarget &&
            snapshot.faceMotion.trackingEnabled &&
            sincroFace
        ) {
            this.applySincroFaceMotion(sincroFace);
            return;
        }
        // 顔認識機能の状況を元に、顔認識モードと、カメラの方向を向くモードを切り替える
        if (
            snapshot?.motionPolicy.allowGazeMotion &&
            (snapshot.gaze.trackingEnabled || this.characterGaze.modelIsLoaded())
        ) {
            const targetX = snapshot?.gaze.detected ? snapshot.gaze.targetX : 0.5;
            const targetY = snapshot?.gaze.detected ? snapshot.gaze.targetY : 0.5;
            const targetRx = MathUtils.clamp(
                (targetY - 0.5) * MathUtils.degToRad(24),
                MathUtils.degToRad(-10),
                MathUtils.degToRad(10),
            );
            const targetRy = MathUtils.clamp(
                -(targetX - 0.5) * MathUtils.degToRad(42),
                MathUtils.degToRad(-18),
                MathUtils.degToRad(18),
            );
            const timeConstantMs = snapshot?.gaze.detected ? 260 : 420;
            const alpha = 1 - Math.exp(-deltaMs / timeConstantMs);
            this.setEyeTarget(
                this.rotation.x + (targetRx - this.rotation.x) * alpha,
                this.rotation.y + (targetRy - this.rotation.y) * alpha,
                0,
            );
        } else {
            // カメラの方向を向くモード
            this.setEyeToCamera(this.vrmCamera.camera);
        }
        if (snapshot?.motionPolicy.allowAiSpeechGesture) {
            this.applyAiSpeechMotion(snapshot, nowMs, deltaMs);
        }
        this.headControlNode.position.copy(this.position);
        this.headControlNode.rotation.copy(this.rotation);
        this.headControlNode.scale.copy(this.scale);
    }

    /* VRMLookAtApplierを用いたほうがいいのでは? */
    // 現状は簡易的に neck 回転へ直接反映する。極端な左右回転は clamp して不自然さを抑える。
    private setEyeTarget(rx: number, ry: number, rz: number) {
        //const beta:float = Tools.ToRadians(-20);
        this.rotation.x = (this.rotation.x + rx) / 2;
        this.rotation.z = rz;
        if (ry > MathUtils.degToRad(90) || ry < MathUtils.degToRad(-90)) {
            this.rotation.y = this.rotation.y / 1.1;
        } else if (ry > MathUtils.degToRad(45)) {
            this.rotation.y = (this.rotation.y + MathUtils.degToRad(45)) / 2;
        } else if (ry < MathUtils.degToRad(-45)) {
            this.rotation.y = (this.rotation.y + MathUtils.degToRad(-45)) / 2;
        } else {
            this.rotation.y = ry;
        }
    }

    // 顔検出未使用/未初期化時のフォールバック。カメラ方向を向くように neck 回転を計算する。
    private setEyeToCamera(camera: PerspectiveCamera): void {
        // neckNode のワールド座標を取得してカメラとの方向ベクトルを求める
        if (!this.headControlNode) {
            return;
        }
        const neckWorldPos = this.headControlNode.getWorldPosition(new Vector3());
        const cameraDirection = camera.position.clone().sub(neckWorldPos).normalize();

        // X軸、Y軸の回転角度を計算し、setEyeTarget に反映
        const angleX = -Math.atan2(
            cameraDirection.y,
            Math.sqrt(
                cameraDirection.x * cameraDirection.x + cameraDirection.z * cameraDirection.z,
            ),
        );
        const angleY = Math.atan2(cameraDirection.x, cameraDirection.z);
        // そのままだと首の上下方向の動きが激しすぎるので、1/2にしておく
        this.setEyeTarget(angleX / 2, angleY, 0);
    }

    private getHeadControlNode(): Object3D | null {
        const fallbackOrder: VRMHumanBoneName[] = ["neck", "head", "upperChest", "chest", "spine"];
        for (const name of fallbackOrder) {
            const node = this.vrm.humanoid.getNormalizedBoneNode(name);
            if (node) {
                // neck が無いVRMでは head/chest 系ボーンを代替するため、local position/scale は保持する。
                this.position.copy(node.position);
                this.scale.copy(node.scale);
                return node;
            }
        }
        return null;
    }

    private captureSincroHeadBones(): void {
        for (const name of ["upperChest", "neck", "head"] as const) {
            const node = this.vrm.humanoid.getNormalizedBoneNode(name);
            if (!node) {
                continue;
            }
            this.sincroHeadNodes.set(name, {
                node,
                baseRotation: node.rotation.clone(),
            });
        }
    }

    private applySincroFaceMotion(sincroFace: SincroFaceRetargetFrame): void {
        const appliedNodes = new Set<Object3D>();
        this.applySincroBone("upperChest", sincroFace.head.upperChest, appliedNodes);
        this.applySincroBone("neck", sincroFace.head.neck, appliedNodes);
        this.applySincroBone("head", sincroFace.head.head, appliedNodes);
        if (appliedNodes.size > 0 || !this.headControlNode) {
            return;
        }

        // neck/head/upperChest が無いモデルでは、chat 用 fallback ボーンに合算して安全に追従させる。
        this.headControlNode.rotation.set(
            sincroFace.head.upperChest.x + sincroFace.head.neck.x + sincroFace.head.head.x,
            sincroFace.head.upperChest.y + sincroFace.head.neck.y + sincroFace.head.head.y,
            sincroFace.head.upperChest.z + sincroFace.head.neck.z + sincroFace.head.head.z,
        );
    }

    private applySincroBone(
        name: SincroHeadBoneName,
        rotation: { x: number; y: number; z: number },
        appliedNodes: Set<Object3D>,
    ): void {
        const bone = this.sincroHeadNodes.get(name);
        if (!bone) {
            return;
        }
        bone.node.rotation.set(
            bone.baseRotation.x + rotation.x,
            bone.baseRotation.y + rotation.y,
            bone.baseRotation.z + rotation.z,
        );
        appliedNodes.add(bone.node);
    }

    private applyAiSpeechMotion(
        snapshot: CharacterBehaviorSnapshot,
        nowMs: number,
        deltaMs: number,
    ): void {
        const expression = this.aiSpeechExpressionProfile(snapshot.aiSpeech.expressionCode);
        const targetBlend =
            snapshot.motionPolicy.allowAiSpeechGesture && snapshot.aiSpeech.isSpeaking
                ? expression.intentScale
                : 0;
        const timeConstantMs = targetBlend > this.aiSpeechBlend ? 240 : 720;
        const alpha = 1 - Math.exp(-deltaMs / timeConstantMs);
        this.aiSpeechBlend += (targetBlend - this.aiSpeechBlend) * alpha;

        if (
            snapshot.motionPolicy.allowAiSpeechGesture &&
            snapshot.aiSpeech.isSpeaking &&
            snapshot.aiSpeech.beatId !== this.lastAiSpeechBeatId &&
            snapshot.aiSpeech.beatIntensity > 0
        ) {
            this.lastAiSpeechBeatId = snapshot.aiSpeech.beatId;
            this.aiSpeechBeatStartedAtMs = nowMs;
            this.aiSpeechBeatDirection *= -1;
            const kindScale =
                snapshot.aiSpeech.beatKind === "speech_start"
                    ? 1
                    : snapshot.aiSpeech.beatKind === "punctuation"
                      ? 0.5
                      : 0.74;
            this.aiSpeechBeatIntensity = MathUtils.clamp(
                snapshot.aiSpeech.beatIntensity * expression.beatScale * kindScale,
                0,
                1,
            );
        }

        const beat = this.currentAiSpeechBeat(nowMs, snapshot.aiSpeech.isSpeaking);
        this.rotation.x +=
            this.aiSpeechBlend * expression.pitchRad - beat * MathUtils.degToRad(1.15);
        this.rotation.y +=
            beat * this.aiSpeechBeatDirection * MathUtils.degToRad(1.8) +
            this.aiSpeechBlend * expression.yawRad;
        this.rotation.z +=
            beat * this.aiSpeechBeatDirection * MathUtils.degToRad(0.75) +
            this.aiSpeechBlend * expression.rollRad;
    }

    private currentAiSpeechBeat(nowMs: number, isSpeaking: boolean): number {
        if (this.aiSpeechBeatStartedAtMs == null) {
            return 0;
        }
        const progress = (nowMs - this.aiSpeechBeatStartedAtMs) / 520;
        if (progress >= 1 || !isSpeaking) {
            this.aiSpeechBeatStartedAtMs = null;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.aiSpeechBeatIntensity;
    }

    private aiSpeechExpressionProfile(expressionCode: number | null): HeadSpeechExpressionProfile {
        switch (expressionCode) {
            case 2:
                return {
                    intentScale: 0.58,
                    beatScale: 0.52,
                    pitchRad: MathUtils.degToRad(1.2),
                    yawRad: MathUtils.degToRad(-0.25),
                    rollRad: MathUtils.degToRad(-0.5),
                };
            case 3:
                return {
                    intentScale: 0.72,
                    beatScale: 0.62,
                    pitchRad: MathUtils.degToRad(-0.25),
                    yawRad: 0,
                    rollRad: 0,
                };
            case 4:
                return {
                    intentScale: 0.76,
                    beatScale: 0.68,
                    pitchRad: MathUtils.degToRad(-0.75),
                    yawRad: MathUtils.degToRad(0.2),
                    rollRad: MathUtils.degToRad(0.45),
                };
            case 5:
                return {
                    intentScale: 0.78,
                    beatScale: 0.78,
                    pitchRad: MathUtils.degToRad(-1.0),
                    yawRad: 0,
                    rollRad: 0,
                };
            case 1:
                return {
                    intentScale: 0.5,
                    beatScale: 0.42,
                    pitchRad: MathUtils.degToRad(-0.2),
                    yawRad: MathUtils.degToRad(0.12),
                    rollRad: MathUtils.degToRad(0.28),
                };
            default:
                return {
                    intentScale: 0.52,
                    beatScale: 0.46,
                    pitchRad: MathUtils.degToRad(-0.25),
                    yawRad: 0,
                    rollRad: 0,
                };
        }
    }
}

type HeadSpeechExpressionProfile = {
    intentScale: number;
    beatScale: number;
    pitchRad: number;
    yawRad: number;
    rollRad: number;
};

type SincroHeadBoneName = "upperChest" | "neck" | "head";

type SincroHeadBone = {
    node: Object3D;
    baseRotation: Euler;
};
