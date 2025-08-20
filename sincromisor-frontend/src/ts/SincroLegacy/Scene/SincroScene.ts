import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience';
import { ScenePerformancePriority } from '@babylonjs/core/scene';
//import { StageFloor } from './Stage/StageFloor';
import { SceneLogger } from './SceneLogger';
import { CharacterManager } from '../Character/CharacterManager';
import { Inspector } from '@babylonjs/inspector';
import { StageLight } from './SceneLight';
import { StageCamera } from './SceneCamera';
import { TalkManager } from '../../RTC/TalkManager';

// https://learn.microsoft.com/ja-jp/windows/mixed-reality/develop/javascript/tutorials/babylonjs-webxr-helloworld/introduction-01
// https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene

export class SincroScene {
    protected readonly canvas: HTMLCanvasElement;
    protected readonly vrMode: boolean;
    protected readonly withCharacter: boolean;
    protected readonly withInspector: boolean;
    protected readonly engine: Engine;
    protected readonly scene: Scene;
    protected readonly logger: SceneLogger;
    protected readonly light: StageLight;
    protected readonly camera: StageCamera;
    protected readonly talk: TalkManager;
    character?: CharacterManager;

    constructor(canvas: HTMLCanvasElement, talk: TalkManager,
        vrMode: boolean, withCharacter: boolean, withInspector: boolean) {
        SceneLoader.ShowLoadingScreen = false;

        this.talk = talk;
        this.vrMode = vrMode;
        this.withInspector = withInspector;
        this.withCharacter = withCharacter;
        this.canvas = canvas;
        this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new Scene(this.engine);
        this.light = new StageLight(this.scene);
        this.camera = this.setupCamera();

        if (this.withInspector) {
            const bodyElement = document.querySelector('body');
            if (bodyElement) {
                bodyElement.style.overflow = 'auto';
            }
            Inspector.Show(this.scene, {});
        }
        this.logger = new SceneLogger();
        // https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene#intermediate-mode
        // this.scene.performancePriority = ScenePerformancePriority.Aggressive;
        // this.scene.performancePriority = ScenePerformancePriority.Intermediate;
        this.scene.performancePriority = ScenePerformancePriority.BackwardCompatible;
        this.scene.autoClear = true;
        this.scene.clearColor = new Color4(0, 0, 0, 0.01); // Background color
        this.setResizeEvent();
    }

    protected setupCamera(): StageCamera {
        return new StageCamera(this.canvas, this.scene, this.vrMode);
    }

    run(): void {
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });
    }

    private setResizeEvent(): void {
        const rObserver: ResizeObserver = new ResizeObserver(() => {
            this.applyCanvasSize();
        });
        rObserver.observe(this.canvas as unknown as Element);
    }

    applyCanvasSize(): void {
        this.camera.reconfigure();
        this.engine.resize();
    }

    async createScene(): Promise<void> {
        if (this.vrMode) {
            const xrHelper: WebXRDefaultExperience = await WebXRDefaultExperience.CreateAsync(this.scene);
            //const xrHelper: WebXRDefaultExperience = await this.scene.createDefaultXRExperienceAsync();
            console.log(xrHelper);
        }

        if (this.withCharacter) {
            const character: CharacterManager = new CharacterManager(this.scene, this.light);
            character.loadModel(() => {
                this.applyCanvasSize();
            });
            this.character = character;
        }
        //new StageFloor(this.scene);
        this.customizeScene();
    }

    dispose(): void {
        this.engine.stopRenderLoop();
        this.scene.dispose();
        this.engine.dispose();
    }

    protected customizeScene(): void {
    }
}
