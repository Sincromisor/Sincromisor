import { VRMScene } from "../VRMScene/VRMScene";
import { CircleGeometry } from "three/src/geometries/CircleGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { MeshBasicMaterial } from "three/src/materials/MeshBasicMaterial.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { CanvasTexture } from "three/src/textures/CanvasTexture.js";
import { DoubleSide } from "three/src/constants.js";
import { SphereVideo } from "./SphereVideo";
import { VideoTexture } from "three/src/textures/VideoTexture.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { SRGBColorSpace } from 'three/src/constants.js';
//import { MathUtils } from "three/src/math/MathUtils.js";

export class VRM360Scene extends VRMScene {
    private readonly sphereVideo: SphereVideo;
    private readonly lightSphere: Mesh;
    /* 動画球の高さをだいたい身長 + カメラの高さ(1.9m)ぐらいに合わせる */
    private readonly videoPositionY: number = 1.9;

    constructor(canvasRoot: HTMLDivElement, controlTarget: HTMLElement, vrmUrl: string, xrMode: boolean = false) {
        super(canvasRoot, controlTarget, vrmUrl, xrMode);
        this.sphereVideo = new SphereVideo(this.getVideoId());
        this.createWorldSphere(this.sphereVideo.videoTexture);
        this.createFlatFloor();
        this.lightSphere = this.createLightSphere();
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputColorSpace = SRGBColorSpace;
    }

    /* URLのvideo_idパラメーターから、閲覧する動画のIDを得る。パラメーターが無い場合は、'default'を返す。 */
    private getVideoId(): string {
        const urlParams: URLSearchParams = new URLSearchParams(window.location.search);
        const regex = /^[a-zA-Z0-9_]{1,32}$/;
        const video_id = urlParams.get('video_id') ?? 'default';

        if (regex.test(video_id)) {
            return video_id;
        } else {
            return 'default';
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
        const canvas: HTMLCanvasElement = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error('Failed to get 2d context');
        }

        const gradient: CanvasGradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(63,63,63,1)');
        gradient.addColorStop(0.8, 'rgba(63,63,63,0.8)');
        gradient.addColorStop(1, 'rgba(63,63,63,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture: CanvasTexture = new CanvasTexture(canvas);
        const material: MeshStandardMaterial = new MeshStandardMaterial({
            map: texture, transparent: true, side: DoubleSide, roughness: 0.8, metalness: 0.2
        });
        const floor: Mesh = new Mesh(geometry, material);
        floor.position.y = 0;  // キャラクターの位置に合わせる
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    protected override updateScene(): void {
        const lightPosition: Vector3 = this.sphereVideo.getLightPosition();
        const lightIntensity: number = this.sphereVideo.getLightIntensity();
        this.vrmLight.setPotision(lightPosition);
        this.vrmLight.setIntensity(lightIntensity);

        this.lightSphere.position.set(this.vrmLight.posX, this.vrmLight.posY, this.vrmLight.posZ);
    }
}
