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
// simple-vrm / vrm360 / Looking Glass で「通常閲覧時の視点」を揃える基準になる。
export class VRMCamera {
    public readonly camera: PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly cameraFov: number;

    constructor(targetElement: HTMLElement) {
        const CAMERA_FOV = 30.0;
        const CAMERA_Z = 1.2;
        this.cameraFov = CAMERA_FOV;
        // 顔が見やすい距離・高さを既定にし、細かい差分は scene 側のキャラクター配置で吸収する。
        this.camera = new PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.001, 100.0);
        this.camera.position.set(0.0, 1.45, CAMERA_Z);
        this.controls = new OrbitControls(this.camera, targetElement);
        // キャラクターとの距離
        this.controls.maxDistance = 10;
        this.controls.minDistance = 0.75;
        // minPolarAngle: キャラクターを上から見下ろす際の角度
        // maxPolarAngle: キャラクターを下から見上げる際の角度
        this.controls.minPolarAngle = Math.PI * 0.15;
        this.controls.maxPolarAngle = Math.PI * 0.75;
        this.controls.screenSpacePanning = true;
        this.controls.target.set(0.0, 1.4, 0.0);
        this.controls.update();
    }

    // renderer resize に追従して射影行列を更新する。
    updateAspect(ratio: number){
        this.camera.aspect = ratio;
        this.camera.updateProjectionMatrix();
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
        this.controls.update();
    }
}
