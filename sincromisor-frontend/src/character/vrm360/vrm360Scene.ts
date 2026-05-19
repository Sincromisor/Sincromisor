import { DoubleSide, SRGBColorSpace } from "three/src/constants.js";
import { CircleGeometry } from "three/src/geometries/CircleGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { MeshBasicMaterial } from "three/src/materials/MeshBasicMaterial.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import type { Vector3 } from "three/src/math/Vector3.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { CanvasTexture } from "three/src/textures/CanvasTexture.js";
import type { VideoTexture } from "three/src/textures/VideoTexture.js";
import { LookingGlassXRController } from "../lookingGlass/lookingGlassXrController";
import { VRMScene, type VRMSceneOptions } from "../scene/vrmScene";
import { SphereVideo } from "./sphereVideo";
//import { MathUtils } from "three/src/math/MathUtils.js";

export class VRM360Scene extends VRMScene {
    private readonly sphereVideo: SphereVideo;
    private readonly lightSphere: Mesh;
    private lookingGlassXRController?: LookingGlassXRController;
    /* 動画球の高さをだいたい身長 + カメラの高さ(1.9m)ぐらいに合わせる */
    private readonly videoPositionY: number = 1.9;

    constructor(options: VRMSceneOptions) {
        super(options);
        // 360 背景動画 + floor/light 補助を追加して、通常 VRMScene から 360 向け構成へ拡張する。
        this.sphereVideo = new SphereVideo(this.getVideoId());
        this.createWorldSphere(this.sphereVideo.videoTexture);
        this.createFlatFloor();
        this.lightSphere = this.createLightSphere();
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputColorSpace = SRGBColorSpace;
    }

    // Looking Glass WebXR の start/stop を受けるコントローラを初期化する。
    enableLookingGlassStartButton(): void {
        if (this.lookingGlassXRController) {
            return;
        }
        // Control Panel / (互換) Debug Console の start/stop 導線で使う LG controller を 1 回だけ生成する。
        this.lookingGlassXRController = new LookingGlassXRController(this.renderer, this.scene);
        this.lookingGlassXRController.attachToStartButton();
    }

    /*  URLのvideo_idパラメーターから、閲覧する動画のIDを得る。
        video_idの形式はfile/VIDEONAMEまたはlive/VIDEONAME。利用できる文字列はa-zA-Z0-9_/で、最大64文字。
        パラメーターが無い場合は、'file/default'を返す。 */
    private getVideoId(): string {
        const urlParams: URLSearchParams = new URLSearchParams(window.location.search);
        const regex: RegExp = /^(file|live)\/[a-zA-Z0-9_]{1,64}$/;
        const video_id = urlParams.get("video_id") ?? "file/default";

        if (regex.test(video_id)) {
            return video_id;
        } else {
            return "file/default";
        }
    }

    private createWorldSphere(videoTexture: VideoTexture): void {
        const geometry: SphereGeometry = new SphereGeometry(10, 32, 32);
        geometry.scale(-1, 1, 1);
        const material: MeshBasicMaterial = new MeshBasicMaterial({ map: videoTexture });
        /* AOマップ(環境光)を無視 */
        material.aoMapIntensity = 0;
        /* 霧の効果を無効化 */
        material.fog = false;
        /* ライトマップを無効化 */
        material.lightMapIntensity = 0;
        /* 反射マップを無効化 */
        material.reflectivity = 0;
        const sphere: Mesh = new Mesh(geometry, material);
        // 動画球の中心をキャラクター頭部付近に寄せ、360映像の地平線と破綻しにくい位置にする。
        sphere.position.y = this.videoPositionY;
        /*
            カメラの前方がキャラクターの後ろに来るようにする
            (ライトの位置も同様に動かす必要あり)
         */
        // sphere.rotation.y = MathUtils.degToRad(-90);
        this.scene.add(sphere);
    }

    private createLightSphere(): Mesh {
        const geometry: SphereGeometry = new SphereGeometry(0.5, 16, 16);
        geometry.scale(-1, 1, 1);
        const material: MeshBasicMaterial = new MeshBasicMaterial({ color: 0xffffff });
        const sphere: Mesh = new Mesh(geometry, material);
        sphere.position.y = 1;
        this.scene.add(sphere);
        return sphere;
    }

    /* 中央部分から外周にかけて、グラデーションで色が薄くなっていく円形の床を用意する。 */
    private createFlatFloor(): void {
        const geometry: CircleGeometry = new CircleGeometry(10, 32);
        geometry.rotateX(-Math.PI / 2);

        const size: number = 256;
        const canvas: HTMLCanvasElement = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
            throw new Error("Failed to get 2d context");
        }

        const gradient: CanvasGradient = ctx.createRadialGradient(
            size / 2,
            size / 2,
            0,
            size / 2,
            size / 2,
            size / 2,
        );
        gradient.addColorStop(0, "rgba(63,63,63,1)");
        gradient.addColorStop(0.8, "rgba(63,63,63,0.8)");
        gradient.addColorStop(1, "rgba(63,63,63,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture: CanvasTexture = new CanvasTexture(canvas);
        const material: MeshStandardMaterial = new MeshStandardMaterial({
            map: texture,
            transparent: true,
            side: DoubleSide,
            roughness: 0.8,
            metalness: 0.2,
        });
        const floor: Mesh = new Mesh(geometry, material);
        floor.position.y = 0; // キャラクターの位置に合わせる
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    protected override updateScene(): void {
        // 360映像から抽出した簡易ライト情報を VRM 照明へ反映して、映像環境に馴染ませる。
        const lightPosition: Vector3 = this.sphereVideo.getLightPosition();
        const lightIntensity: number = this.sphereVideo.getLightIntensity();
        this.vrmLight.setPotision(lightPosition);
        this.vrmLight.setIntensity(lightIntensity);

        this.lightSphere.position.set(this.vrmLight.posX, this.vrmLight.posY, this.vrmLight.posZ);
    }
}
