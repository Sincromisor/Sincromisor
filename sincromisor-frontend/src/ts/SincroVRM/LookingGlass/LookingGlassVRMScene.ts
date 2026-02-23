import { VRMScene } from "../VRMScene/VRMScene";
import { LookingGlassXRController } from "./LookingGlassXRController";
import { DoubleSide, RepeatWrapping, SRGBColorSpace } from "three/src/constants.js";
import { CircleGeometry } from "three/src/geometries/CircleGeometry.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { TextureLoader } from "three/src/loaders/TextureLoader.js";
import { Vector3 } from "three/src/math/Vector3.js";

// Looking Glass 用の VRM シーン。
// 360 背景動画は使わず、通常 VRMScene に Looking Glass 起動導線だけを追加する。
export class LookingGlassVRMScene extends VRMScene {
    private lookingGlassXRController: LookingGlassXRController | null = null;
    private static readonly CAMERA_PITCH_COMPENSATION_DEG = -25;
    // 縦長 LKG 表示向けに、通常 preview も少し引いて下寄りの構図にする。
    private static readonly PREVIEW_CAMERA_TARGET = new Vector3(0, 0.95, 0);
    private static readonly PREVIEW_CAMERA_POSITION = new Vector3(0, 1.05, 2.2);

    constructor(
        canvasRoot: HTMLDivElement,
        controlTarget: HTMLElement,
        vrmUrl: string,
        xrMode: boolean = false,
        onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | null) => void,
    ) {
        super(canvasRoot, controlTarget, vrmUrl, xrMode, onThumbnailLoaded);
        // LG の WebXR 描画経路は vrm360 で使っていた renderer 設定に依存するケースがあるため互換設定を維持する。
        // 背景360動画は使わないが、色空間/影設定は LG ページでも合わせておく。
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputColorSpace = SRGBColorSpace;
        // 筐体の前傾（約25度）ぶんを視点側で補正し、キャラクターが後ろへ倒れて見える印象を抑える。
        this.setCameraPitchCompensationDeg(LookingGlassVRMScene.CAMERA_PITCH_COMPENSATION_DEG);
        this.setCameraViewPose(
            LookingGlassVRMScene.PREVIEW_CAMERA_TARGET.clone(),
            LookingGlassVRMScene.PREVIEW_CAMERA_POSITION.clone(),
        );
        // 展示向けの床テクスチャを見せるため、開発用グリッドは LG ページでは非表示にする。
        this.setGridHelperVisible(false);
        this.createTexturedFloor();
        this.bindLookingGlassStateRecovery();
    }

    enableLookingGlassStartButton(): void {
        if (this.lookingGlassXRController) {
            return;
        }
        this.lookingGlassXRController = new LookingGlassXRController(this.renderer, this.scene);
        this.lookingGlassXRController.attachToStartButton();
    }

    private createTexturedFloor(): void {
        // 展示用のテーブルクロス色に合わせた床テクスチャを LG ページだけに追加する。
        const geometry = new CircleGeometry(10, 64);
        geometry.rotateX(-Math.PI / 2);

        const texture = new TextureLoader().load("/characters/assets/floor.jpg");
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        // 展示距離では 6x6 だと模様が大きく見えるため、繰り返し数を増やして密度を上げる。
        texture.repeat.set(14, 14);

        const material = new MeshStandardMaterial({
            map: texture,
            side: DoubleSide,
            roughness: 0.9,
            metalness: 0.05,
        });

        const floor = new Mesh(geometry, material);
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    private bindLookingGlassStateRecovery(): void {
        // LG セッション終了/再開後に OrbitControls の pointer 配線が不安定になるケースへの回復処理。
        window.addEventListener("sincro:looking-glass-state", (event) => {
            const detail = (event as CustomEvent<{ state: string; code?: string; }>).detail;
            if (!detail) {
                return;
            }
            if (detail.state === "starting" || detail.state === "recovering" || detail.state === "active") {
                this.refreshCameraInteractionBindings();
            }
            if (detail.state === "recovering") {
                // XR 終了直後は renderer/canvas のサイズが崩れることがあるため、次フレームで復元する。
                requestAnimationFrame(() => {
                    this.refreshRendererLayout();
                });
                requestAnimationFrame(() => {
                    this.refreshRendererLayout();
                });
            }
        }, { passive: true });
    }
}
