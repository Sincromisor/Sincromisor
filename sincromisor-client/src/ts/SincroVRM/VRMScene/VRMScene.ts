import { Scene, GridHelper, AxesHelper, WebGLRenderer } from 'three';
import { VRMCharacterManager } from '../VRMCharacter/VRMCharacterManager';
import { VRMCamera } from './VRMCamera';
import { VRMLight } from './VRMLight';

export class VRMScene {
    protected readonly scene: Scene;
    private readonly renderer: WebGLRenderer;
    private readonly vrmCharacterManager: VRMCharacterManager;
    private readonly vrmCamera: VRMCamera;
    protected readonly vrmLight: VRMLight;

    constructor(canvasRoot: HTMLDivElement, vrmUrl: string) {
        this.scene = new Scene();
        this.vrmLight = new VRMLight();
        this.scene.add(this.vrmLight.light);

        const gridHelper = new GridHelper(10, 10);
        this.scene.add(gridHelper);
        const axesHelper = new AxesHelper(5);
        this.scene.add(axesHelper);

        this.vrmCamera = new VRMCamera(canvasRoot);
        this.vrmCharacterManager = new VRMCharacterManager(this.scene, this.vrmCamera, vrmUrl);

        // レンダラーを設定する。背景は透過する。
        this.renderer = new WebGLRenderer({ alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        canvasRoot.appendChild(this.renderer.domElement);

        this.animate();
    }

    private animate(): void {
        window.requestAnimationFrame(() => {
            this.animate()
        });
        this.updateScene();
        this.vrmCharacterManager.update();
        this.renderer.render(this.scene, this.vrmCamera.camera);
    }

    /* フレームごとのシーンの更新処理を記述する。 */
    protected updateScene(): void {
    }
}
