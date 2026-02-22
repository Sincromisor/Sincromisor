import { Vector3 } from 'three/src/math/Vector3.js';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { GridHelper } from 'three/src/helpers/GridHelper.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { VRMCharacterManager } from '../VRMCharacter/VRMCharacterManager';
import { VRMCamera } from './VRMCamera';
import { VRMLight } from './VRMLight';

// VRM表示ページの共通ベースシーン。
// キャラクター・カメラ・ライト・renderer の基本構成をまとめ、派生クラスは updateScene() を上書きする。
export class VRMScene {
    protected readonly scene: Scene;
    protected readonly renderer: WebGLRenderer;
    private readonly vrmCharacterManager: VRMCharacterManager;
    private readonly vrmCamera: VRMCamera;
    protected readonly vrmLight: VRMLight;
    private readonly xrSessionMode: XRSessionMode = 'immersive-vr';
    private readonly xrMode: boolean;

    constructor(
        canvasRoot: HTMLDivElement,
        controlTarget: HTMLElement,
        vrmUrl: string,
        xrMode: boolean = false,
        onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | null) => void,
    ) {
        this.scene = new Scene();
        this.vrmLight = new VRMLight();
        this.scene.add(this.vrmLight.light);
        this.scene.add(this.vrmLight.ambientLight);

        // 配置調整時の目安用。最終UIでは目立ちにくいが、座標系の確認に使える。
        const gridHelper = new GridHelper(10, 10);
        this.scene.add(gridHelper);
        /*
        const axesHelper = new AxesHelper(5);
        axesHelper.setColors(new Color('rgb(255,0,0)'), new Color('rgb(0,255,0)'), new Color('rgb(0,0,255)'));
        this.scene.add(axesHelper);
        */
        // OrbitControls を含むカメラ設定は専用クラスへ分離し、ページ差分から独立させる。
        this.vrmCamera = new VRMCamera(controlTarget);
        // VRMロード完了時にサムネイル取得結果を呼び出し元へ返し、UIアイコン更新に利用する。
        this.vrmCharacterManager = new VRMCharacterManager(this.scene, this.vrmCamera, vrmUrl, onThumbnailLoaded);

        // レンダラーを設定する。背景透過にして UI オーバーレイ（chat/telop/debug）と重ねる。
        this.renderer = new WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        canvasRoot.appendChild(this.renderer.domElement);

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
            const width = window.innerWidth;
            const height = window.innerHeight;

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.vrmCamera.updateAspect(width / height);
        }
    }

    /* フレームごとのシーンの更新処理を記述する。派生クラスで環境差分のみ実装する。 */
    protected updateScene(): void {
    }

    /* WebXR対応チェック */
    private async checkXRSupport(): Promise<void> {
        if ('xr' in navigator) {
            try {
                // 'immersive-vr'モードがサポートされているかチェック
                const isSupported = await navigator.xr?.isSessionSupported(this.xrSessionMode);
                if (isSupported) {
                    console.log('WebXR VRモードがサポートされています');
                } else {
                    console.log('このブラウザはWebXR VRモードをサポートしていません');
                }
            } catch (err) {
                console.error('WebXR対応確認中にエラーが発生しました:', err);
            }
        } else {
            console.warn('このブラウザはWebXR APIをサポートしていません');
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
