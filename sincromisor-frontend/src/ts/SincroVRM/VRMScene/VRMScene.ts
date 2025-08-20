import { Vector3 } from 'three/src/math/Vector3.js';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { GridHelper } from 'three/src/helpers/GridHelper.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { VRMCharacterManager } from '../VRMCharacter/VRMCharacterManager';
import { VRMCamera } from './VRMCamera';
import { VRMLight } from './VRMLight';

export class VRMScene {
    protected readonly scene: Scene;
    protected readonly renderer: WebGLRenderer;
    private readonly vrmCharacterManager: VRMCharacterManager;
    private readonly vrmCamera: VRMCamera;
    protected readonly vrmLight: VRMLight;
    private readonly xrSessionMode: XRSessionMode = 'immersive-vr';
    private readonly xrMode: boolean;

    constructor(canvasRoot: HTMLDivElement, controlTarget: HTMLElement, vrmUrl: string, xrMode: boolean = false) {
        this.scene = new Scene();
        this.vrmLight = new VRMLight();
        this.scene.add(this.vrmLight.light);
        this.scene.add(this.vrmLight.ambientLight);

        const gridHelper = new GridHelper(10, 10);
        this.scene.add(gridHelper);
        /*
        const axesHelper = new AxesHelper(5);
        axesHelper.setColors(new Color('rgb(255,0,0)'), new Color('rgb(0,255,0)'), new Color('rgb(0,0,255)'));
        this.scene.add(axesHelper);
        */
        this.vrmCamera = new VRMCamera(controlTarget);
        this.vrmCharacterManager = new VRMCharacterManager(this.scene, this.vrmCamera, vrmUrl);

        // レンダラーを設定する。背景は透過する。
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
        this.updateScene();
        this.vrmCharacterManager.update();
        this.renderer.render(this.scene, this.vrmCamera.camera);
    }

    private setupResizeHandler(): void {
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

    /* フレームごとのシーンの更新処理を記述する。 */
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
            this.updateScene();
            this.vrmCharacterManager.update();
            this.renderer.render(this.scene, this.vrmCamera.camera);
        });
    }
}
