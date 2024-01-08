import { VRMScene } from "../VRMScene/VRMScene";
import { CircleGeometry } from "three/src/geometries/CircleGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { MeshBasicMaterial } from "three/src/materials/MeshBasicMaterial.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { VideoTexture } from "three/src/textures/VideoTexture.js";
import { CanvasTexture } from "three/src/textures/CanvasTexture.js";
import { LinearFilter, RGBFormat, DoubleSide } from "three/src/constants.js";

export class VRM360Scene extends VRMScene {
    protected override customizeScene(): void {
        this.createWorldSphere();
        this.createFlatFloor();
    }

    private createVideoElement(): HTMLVideoElement {
        const videoElement: HTMLVideoElement = document.createElement('video');
        videoElement.src = '/area360/videos/movie.mp4';
        videoElement.crossOrigin = 'anonymous';
        videoElement.loop = true;
        videoElement.muted = true;
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.play();
        return videoElement;
    }

    private createVideoTexture(videoElement: HTMLVideoElement): VideoTexture {
        const texture: VideoTexture = new VideoTexture(videoElement);
        texture.minFilter = LinearFilter;
        texture.format = RGBFormat;
        return texture;
    }

    private createWorldSphere(): void {
        const geometry: SphereGeometry = new SphereGeometry(10, 32, 32);
        geometry.scale(-1, 1, 1);
        const texture: VideoTexture = this.createVideoTexture(this.createVideoElement());
        const material: MeshBasicMaterial = new MeshBasicMaterial({ map: texture });
        const sphere: Mesh = new Mesh(geometry, material);
        sphere.position.y = 1;  // 必要に応じて調整
        this.scene.add(sphere);
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

        // ラジアルグラデーションを作成
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
}
