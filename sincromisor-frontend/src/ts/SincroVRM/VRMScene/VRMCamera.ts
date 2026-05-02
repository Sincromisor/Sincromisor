import { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Vector3 } from "three/src/math/Vector3.js";

// simple-vrm の初期自動フレーミング調整値。
// 役割ごとにまとめ、実機確認時に「どれを触るべきか」を分かりやすくする。
const SIMPLE_VRM_AUTO_FRAMING_CAMERA = {
    // 上端の余白率。値を増やすと頭上に余白が増え、切れにくくなる代わりに少し引いて見える。
    // 頭頂が切れる場合は 0.02 ずつ増やす（推奨範囲: 0.04 - 0.12）。
    topPaddingRatio: 0.04,
    // 下端の余白率。値を増やすと胸元〜襟元が見えやすくなるが、全体は少し引いて見える。
    // 胸元が詰まりすぎる場合は 0.02 ずつ増やす（推奨範囲: 0.04 - 0.12）。
    bottomPaddingRatio: 0.06,
    // 距離の安全係数。値を下げると寄る / 値を上げると引く。
    // 「遠い」と感じる場合は 0.02 ずつ下げる、「切れやすい」場合は 0.02 ずつ上げる（推奨範囲: 0.90 - 1.08）。
    distanceSafetyScale: 0.93,
    // カメラ位置をターゲットより少し上に置く比率。値を増やすと見下ろし気味になり、顔がやや下に見える。
    // 顔が低く見える場合は 0.02 ずつ増やす。顔が高く見える場合は 0.02 ずつ下げる（推奨範囲: 0.00 - 0.12）。
    cameraLiftRatio: 0.08,
} as const;

// VRM表示用の既定カメラと OrbitControls 設定をまとめるクラス。
// OrbitControls は UI shell 全体ではなく、キャラクター操作専用 input layer だけを購読する。
// simple-vrm / vrm360 / Looking Glass で「通常閲覧時の視点」を揃える基準になる。
export class VRMCamera {
    public readonly camera: PerspectiveCamera;
    private controls: OrbitControls;
    private readonly cameraFov: number;
    private readonly inputLayer: HTMLElement;
    private pitchCompensationRad = 0;

    constructor(inputLayer: HTMLElement) {
        const CAMERA_FOV = 30.0;
        const CAMERA_Z = 1.2;
        this.cameraFov = CAMERA_FOV;
        this.inputLayer = inputLayer;
        // 顔が見やすい距離・高さを既定にし、細かい差分は scene 側のキャラクター配置で吸収する。
        this.camera = new PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.001, 100.0);
        this.camera.position.set(0.0, 1.45, CAMERA_Z);
        this.controls = this.createOrbitControls();
        this.controls.update();
        this.applyPitchCompensation();
    }

    // renderer resize に追従して射影行列を更新する。
    updateAspect(ratio: number){
        this.camera.aspect = ratio;
        this.camera.updateProjectionMatrix();
    }

    // Looking Glass 実機の筐体傾き補正など、ページ固有の視点ピッチ補正を適用する。
    // OrbitControls の target を維持したまま camera 位置だけを回して、接地感を調整する。
    setPitchCompensationDeg(deg: number): void {
        this.pitchCompensationRad = (deg * Math.PI) / 180.0;
        this.applyPitchCompensation();
        this.controls.update();
    }

    // WebXR セッション切替後に pointer 操作が効かなくなるケース向けに、OrbitControls のイベント配線を再初期化する。
    refreshInteractionBindings(): void {
        const prevTarget = this.controls.target.clone();
        this.controls.dispose();
        this.controls = this.createOrbitControls();
        this.controls.target.copy(prevTarget);
        this.controls.enabled = true;
        this.controls.update();
    }

    // ページ固有の初期構図（展示用プリセット等）を、OrbitControls の target と camera 位置へ直接反映する。
    setViewPose(target: Vector3, cameraPosition: Vector3): void {
        this.controls.target.copy(target);
        this.camera.position.copy(cameraPosition);
        this.applyPitchCompensation();
        this.controls.update();
    }

    // キャラクター寸法に合わせて初期構図を更新する。
    // OrbitControls の target も同時に更新し、以後の操作基準を揃える。
    frameUpperBody(target: Vector3, verticalSpan: number): void {
        const span = Math.max(verticalSpan, 0.2);
        const marginScale = 1.7;
        const fitHeight = span * marginScale;
        const fovRad = this.cameraFov * Math.PI / 180.0;
        const distance = (fitHeight * 0.5) / Math.tan(fovRad * 0.5);

        this.controls.target.copy(target);
        // 上半身フレーミング時は正面寄りを優先し、頭部が切れにくいよう縦オフセットを弱める。
        this.camera.position.set(target.x, target.y, target.z + distance);
        this.applyPitchCompensation();
        this.controls.update();
    }

    // 上端/下端が target を中心に非対称な場合でも切れないよう、必要距離を上下別に計算する。
    frameVerticalRange(target: Vector3, topY: number, bottomY: number): void {
        const span = Math.max(topY - bottomY, 0.2);
        const topPadding = span * SIMPLE_VRM_AUTO_FRAMING_CAMERA.topPaddingRatio;
        const bottomPadding = span * SIMPLE_VRM_AUTO_FRAMING_CAMERA.bottomPaddingRatio;
        const upperExtent = Math.max((topY + topPadding) - target.y, 0.1);
        const lowerExtent = Math.max(target.y - (bottomY - bottomPadding), 0.1);
        const halfHeight = Math.max(upperExtent, lowerExtent) * SIMPLE_VRM_AUTO_FRAMING_CAMERA.distanceSafetyScale;
        const fovRad = this.cameraFov * Math.PI / 180.0;
        const distance = halfHeight / Math.tan(fovRad * 0.5);

        this.controls.target.copy(target);
        // 構図は維持しつつ、わずかに高い位置から見る。
        this.camera.position.set(
            target.x,
            target.y + span * SIMPLE_VRM_AUTO_FRAMING_CAMERA.cameraLiftRatio,
            target.z + distance,
        );
        this.applyPitchCompensation();
        this.controls.update();
    }

    private applyPitchCompensation(): void {
        if (this.pitchCompensationRad === 0) {
            return;
        }

        const target = this.controls.target;
        const offsetX = this.camera.position.x - target.x;
        const offsetY = this.camera.position.y - target.y;
        const offsetZ = this.camera.position.z - target.z;
        const cos = Math.cos(this.pitchCompensationRad);
        const sin = Math.sin(this.pitchCompensationRad);

        // X軸回転で YZ 平面の視点位置だけ補正し、左右構図は維持する。
        const rotatedY = offsetY * cos - offsetZ * sin;
        const rotatedZ = offsetY * sin + offsetZ * cos;

        this.camera.position.set(target.x + offsetX, target.y + rotatedY, target.z + rotatedZ);
    }

    private createOrbitControls(): OrbitControls {
        const controls = new OrbitControls(this.camera, this.inputLayer);
        // キャラクターとの距離
        controls.maxDistance = 10;
        controls.minDistance = 0.75;
        // minPolarAngle: キャラクターを上から見下ろす際の角度
        // maxPolarAngle: キャラクターを下から見上げる際の角度
        controls.minPolarAngle = Math.PI * 0.15;
        controls.maxPolarAngle = Math.PI * 0.75;
        controls.screenSpacePanning = true;
        controls.target.set(0.0, 1.4, 0.0);
        return controls;
    }
}
