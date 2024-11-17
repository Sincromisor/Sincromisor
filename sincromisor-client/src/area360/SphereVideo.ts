import { Scene } from "@babylonjs/core/scene";
import { VideoTexture } from "@babylonjs/core/Materials/Textures/videoTexture";
import { StageLight } from "../ts/Scene/SceneLight";
import { Vector3 } from '@babylonjs/core/Maths';
import { Tools } from "@babylonjs/core/Misc/tools";

type FrameInfo = {
    frameID: number,
    x: number,
    y: number,
    lon: number,
    lat: number,
    brightness: number
}

type VideoInfo = {
    fps: number,
    totalFrames: number,
    totalDuration: number,
    frameInfo: Array<FrameInfo>
}

export class SphereVideo {
    scene: Scene;
    light: StageLight;
    videoElement: HTMLVideoElement;
    videoTexture: VideoTexture;
    videoPath: string = '/area360/videos';
    videoInfo?: VideoInfo;

    constructor(scene: Scene, light: StageLight, videoID: string) {
        this.scene = scene;
        this.light = light;
        this.videoElement = this.createVideoElement(videoID);
        this.videoTexture = this.createVideoTexture(this.videoElement);
        this.getVideoInfo(videoID);
        this.characterLightPosition();
    }

    private async getVideoInfo(videoID: string): Promise<void> {
        await fetch(this.videoPath + '/' + videoID + '.json').then((res) => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        }).then((info: VideoInfo) => {
            console.log(info);
            this.videoInfo = info;
        }).catch((e) => { console.error(e); });
    }

    private createVideoElement(videoID: string): HTMLVideoElement {
        const video: HTMLVideoElement = document.createElement('video');
        video.src = this.videoPath + '/' + videoID + '.mp4'; // 動画ファイルのパス
        video.crossOrigin = 'anonymous';
        video.loop = true;
        // video.muted = true; // 音声をミュートする
        video.style.display = 'none'; // 動画を画面に表示しない
        video.autoplay = true;
        video.play();
        return video;
    }

    private createVideoTexture(videoElement: HTMLVideoElement): VideoTexture {
        const vtexture: VideoTexture = new VideoTexture('video', videoElement, this.scene, true);
        vtexture.uScale = 1;
        vtexture.vScale = -1;
        return vtexture;
    }

    getCurrentTime(): number {
        return this.videoElement.currentTime;
    }

    getDuration(): number {
        return this.videoElement.duration;
    }

    getCurrentFrameNo(): number {
        if (this.videoInfo) {
            return Math.floor((this.getCurrentTime() * this.videoInfo.fps));
        }
        return 0;
    }

    /*
        あらかじめ推測しておいた動画内の光源位置に合わせて、
        キャラクター用ライトの位置と輝度を調整する。
    */
    private characterLightPosition() {
        this.scene.registerBeforeRender(() => {
            if (!this.videoInfo) { return; }
            const frameNo = this.getCurrentFrameNo();
            const frameInfo: FrameInfo = this.videoInfo.frameInfo[frameNo];
            if (!frameInfo) {
                console.error(`frameNo ${frameNo} is not contain frameInfo.`);
                return;
            }
            // キャラクターのボーンの回転が-110度となっていると、光源の位置計算が-110度ズレる。
            // 対策としてframeInfo['lon'] - 110する。よくわからん。
            //console.log(`light: ${frameInfo['lon']}, intensity: ${frameInfo['brightness'] / 255}`);
            const newVec = this.sphericalToCartesian(frameInfo['lat'], frameInfo['lon'] - 110, 95);
            this.light.setCharacterLightPosition(newVec);
            // brightness: 0～255, intensity: 0.0～1.0
            this.light.setCharacterLightIntensity(frameInfo['brightness'] / 255);
        });

    }

    /* 緯度・経度・半径から、直交座標を得る。 */
    private sphericalToCartesian(lat: number, lon: number, radius: number) {
        const latRad = Tools.ToRadians(lat);
        const lonRad = Tools.ToRadians(lon);
        const x = radius * Math.cos(latRad) * Math.cos(lonRad);
        const y = radius * Math.sin(latRad);
        const z = radius * Math.cos(latRad) * Math.sin(lonRad);
        return new Vector3(x, y, z);
    }
}
