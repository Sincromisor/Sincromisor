import { VRButton } from "three/addons/webxr/VRButton.js";
import { GridHelper } from "three/src/helpers/GridHelper.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import { Scene } from "three/src/scenes/Scene.js";
import { frontendLogger } from "../../logging/appLogger";
import type { CharacterMotionTuning } from "../VRMCharacter/CharacterMotionConfig";
import type { SincroPoseRetargetConfig } from "../VRMCharacter/SincroPoseRetargeter";
import { VRMCharacterManager } from "../VRMCharacter/VRMCharacterManager";
import { VRMCamera } from "./VRMCamera";
import { VRMLight } from "./VRMLight";

export type VRMSceneOptions = {
    canvasRoot: HTMLDivElement;
    characterControlLayer: HTMLElement;
    vrmUrl: string;
    xrMode?: boolean;
    onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | undefined) => void;
    enableInitialUpperBodyFraming?: boolean;
};

// VRM表示ページの共通ベースシーン。
// キャラクター・カメラ・ライト・renderer の基本構成をまとめ、派生クラスは updateScene() を上書きする。
export class VRMScene {
    protected readonly scene: Scene;
    protected readonly renderer: WebGLRenderer;
    private readonly gridHelper: GridHelper;
    private readonly vrmCharacterManager: VRMCharacterManager;
    private readonly vrmCamera: VRMCamera;
    protected readonly vrmLight: VRMLight;
    private readonly xrSessionMode: XRSessionMode = "immersive-vr";
    private readonly xrMode: boolean;

    constructor(options: VRMSceneOptions) {
        const xrMode = options.xrMode ?? false;
        this.scene = new Scene();
        this.vrmLight = new VRMLight();
        this.scene.add(this.vrmLight.light);
        this.scene.add(this.vrmLight.ambientLight);

        // 配置調整時の目安用。最終UIでは目立ちにくいが、座標系の確認に使える。
        this.gridHelper = new GridHelper(10, 10);
        this.scene.add(this.gridHelper);
        /*
        const axesHelper = new AxesHelper(5);
        axesHelper.setColors(new Color('rgb(255,0,0)'), new Color('rgb(0,255,0)'), new Color('rgb(0,0,255)'));
        this.scene.add(axesHelper);
        */
        // OrbitControls を含むカメラ設定は専用クラスへ分離し、ページ差分から独立させる。
        this.vrmCamera = new VRMCamera(options.characterControlLayer);
        // VRMロード完了時にサムネイル取得結果を呼び出し元へ返し、UIアイコン更新に利用する。
        this.vrmCharacterManager = new VRMCharacterManager({
            scene: this.scene,
            vrmCamera: this.vrmCamera,
            vrmUrl: options.vrmUrl,
            onThumbnailLoaded: options.onThumbnailLoaded,
            enableInitialUpperBodyFraming: options.enableInitialUpperBodyFraming,
        });

        // レンダラーを設定する。背景透過にして UI オーバーレイ（chat/telop/debug）と重ねる。
        this.renderer = new WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(
            positiveDimensionOrDefault(options.canvasRoot.clientWidth, window.innerWidth),
            positiveDimensionOrDefault(options.canvasRoot.clientHeight, window.innerHeight),
        );
        this.renderer.setPixelRatio(window.devicePixelRatio);
        options.canvasRoot.appendChild(this.renderer.domElement);

        this.setupResizeHandler();

        this.xrMode = xrMode;

        if (xrMode) {
            document.body.appendChild(VRButton.createButton(this.renderer));
            this.renderer.xr.enabled = true;
            this.checkXRSupport();
        }
    }

    // ページ種別ごとの描画開始入口。XR有無で animation loop の経路を切り替える。
    start(): void {
        if (this.xrMode) {
            this.setXRAnimationLoop();
            /* XRモードの時は、1mぐらい後ろに下がる */
            this.vrmCharacterManager.characterPosition = new Vector3(0, 0, 0.0);
        } else {
            this.animate();
        }
    }

    private animate(): void {
        // WebXRセッション中は、renderer.setAnimationLoopが使用される
        if (!this.renderer.xr.isPresenting) {
            window.requestAnimationFrame(() => {
                this.animate();
            });
        }
        // フレーム更新順:
        // 1) 派生クラスの環境更新（360照明など）
        // 2) VRMキャラクター更新
        // 3) render
        this.updateScene();
        this.vrmCharacterManager.update();
        this.renderer.render(this.scene, this.vrmCamera.camera);
    }

    private setupResizeHandler(): void {
        // canvas root サイズ変化に追従し、React UI の開閉/レイアウト変更時も破綻しにくくする。
        const resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
        resizeObserver.observe(this.renderer.domElement.parentElement as Element);
    }

    private handleResize(): void {
        if (this.renderer.domElement.parentElement) {
            const width = positiveDimensionOrDefault(
                this.renderer.domElement.parentElement.clientWidth,
                window.innerWidth,
            );
            const height = positiveDimensionOrDefault(
                this.renderer.domElement.parentElement.clientHeight,
                window.innerHeight,
            );

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.vrmCamera.updateAspect(width / height);
        }
    }

    /* フレームごとのシーンの更新処理を記述する。派生クラスで環境差分のみ実装する。 */
    protected updateScene(): void {}

    // ページ固有の見え方補正（例: Looking Glass 実機の筐体角度）を camera 側へ委譲する。
    protected setCameraPitchCompensationDeg(deg: number): void {
        this.vrmCamera.setPitchCompensationDeg(deg);
    }

    protected setCameraViewPose(target: Vector3, cameraPosition: Vector3): void {
        this.vrmCamera.setViewPose(target, cameraPosition);
    }

    // LG 再開後などで OrbitControls の pointer 入力が不安定になる場合に再初期化する。
    protected refreshCameraInteractionBindings(): void {
        this.vrmCamera.refreshInteractionBindings();
    }

    // XR セッション終了後に canvas サイズ/投影が崩れるケース向けに、viewport 基準で再計算する。
    protected refreshRendererLayout(): void {
        this.handleResize();
    }

    // ページごとに座標グリッドの表示有無を切り替える。
    protected setGridHelperVisible(visible: boolean): void {
        this.gridHelper.visible = visible;
    }

    // 起動後の設定変更（Character ON/OFF）で VRM 本体の表示を切り替える。
    setCharacterVisible(visible: boolean): void {
        this.vrmCharacterManager.setVisible(visible);
    }

    setCharacterMotionTuning(tuning: Partial<CharacterMotionTuning>): void {
        this.vrmCharacterManager.setMotionTuning(tuning);
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.vrmCharacterManager.setSincroPoseRetargetConfig(config);
    }

    /* WebXR対応チェック */
    private async checkXRSupport(): Promise<void> {
        if ("xr" in navigator) {
            try {
                // 'immersive-vr'モードがサポートされているかチェック
                const isSupported = await navigator.xr?.isSessionSupported(this.xrSessionMode);
                if (isSupported) {
                    frontendLogger.info("WebXR VR mode is supported.");
                } else {
                    frontendLogger.info("WebXR VR mode is not supported.");
                }
            } catch (err) {
                frontendLogger.error("Failed to check WebXR support.", { error: err });
            }
        } else {
            frontendLogger.warn("WebXR API is not supported.");
        }
    }

    private setXRAnimationLoop(): void {
        this.renderer.setAnimationLoop(() => {
            // XR時も通常描画と同じ順序を保つ（派生更新 -> VRM更新 -> render）。
            this.updateScene();
            this.vrmCharacterManager.update();
            this.renderer.render(this.scene, this.vrmCamera.camera);
        });
    }
}

function positiveDimensionOrDefault(value: number, defaultValue: number): number {
    return value > 0 ? value : defaultValue;
}
