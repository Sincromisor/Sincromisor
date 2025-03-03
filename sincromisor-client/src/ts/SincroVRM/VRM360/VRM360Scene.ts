import { VRMScene } from "../VRMScene/VRMScene";
import { CircleGeometry } from "three/src/geometries/CircleGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { MeshBasicMaterial } from "three/src/materials/MeshBasicMaterial.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { CanvasTexture } from "three/src/textures/CanvasTexture.js";
import { DoubleSide } from "three/src/constants.js";
import { SphereVideo } from "./SphereVideo";
import { VideoTexture } from "three/src/textures/VideoTexture.js";
import { Vector3 } from "three/src/math/Vector3.js";

export class VRM360Scene extends VRMScene {
    private readonly sphereVideo: SphereVideo;
    private readonly lightSphere: Mesh;

    constructor(canvasRoot: HTMLDivElement, controlTarget: HTMLElement, vrmUrl: string) {
        super(canvasRoot, controlTarget, vrmUrl);
        this.sphereVideo = new SphereVideo('movie');
        this.createWorldSphere(this.sphereVideo.videoTexture);
        this.createFlatFloor();
        this.lightSphere = this.createLightSphere();
    }

    private createWorldSphere(videoTexture: VideoTexture): void {
        const geometry: SphereGeometry = new SphereGeometry(10, 32, 32);
        geometry.scale(-1, 1, 1);
        const material: MeshBasicMaterial = new MeshBasicMaterial({ map: videoTexture });
        const sphere: Mesh = new Mesh(geometry, material);
        sphere.position.y = 1;
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
        const material: MeshBasicMaterial = new MeshBasicMaterial({
            map: texture, transparent: true, side: DoubleSide
        });
        const floor: Mesh = new Mesh(geometry, material);
        floor.position.y = 0;  // キャラクターの位置に合わせる
        this.scene.add(floor);
    }

    protected override updateScene(): void {
        const lightPosition: Vector3 = this.sphereVideo.getLightPosition();
        const lightIntensity : number = this.sphereVideo.getLightIntensity();
        this.vrmLight.setPotision(lightPosition);
        this.vrmLight.setIntensity(lightIntensity * 3);

        console.log(lightPosition);
        this.lightSphere.position.copy(lightPosition);
    }
}
