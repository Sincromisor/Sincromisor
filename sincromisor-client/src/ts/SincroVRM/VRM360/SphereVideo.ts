import { VideoTexture } from "three/src/textures/VideoTexture.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { LinearFilter, RGBFormat } from "three/src/constants.js";
import { SRGBColorSpace } from 'three/src/constants.js';

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
    readonly videoElement: HTMLVideoElement;
    readonly videoTexture: VideoTexture;
    private readonly videoPath: string = '/area360/videos';
    private videoInfo?: VideoInfo;

    constructor(videoID: string) {
        this.videoElement = this.createVideoElement(videoID);
        this.videoTexture = this.createVideoTexture(this.videoElement);
        this.getVideoInfo(videoID);
    }

    private async getVideoInfo(videoID: string): Promise<void> {
        await fetch(this.videoPath + '/' + videoID + '/movie.json').then((res) => {
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
        video.src = this.videoPath + '/' + videoID + '/movie.mp4'; // 動画ファイルのパス
        video.crossOrigin = 'anonymous';
        video.loop = true;
        // video.muted = true; // 音声をミュートする
        video.style.display = 'none'; // 動画を画面に表示しない
        video.autoplay = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.play();
        return video;
    }

    private createVideoTexture(videoElement: HTMLVideoElement): VideoTexture {
        const texture: VideoTexture = new VideoTexture(videoElement);
        /* colorSpaceをSRGBにし、動画の色がくすむのを防ぐ */
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.format = RGBFormat;
        return texture;
    }

    private getCurrentTime(): number {
        return this.videoElement.currentTime;
    }

    getDuration(): number {
        return this.videoElement.duration;
    }

    private getCurrentFrameNo(): number {
        if (this.videoInfo) {
            return Math.floor((this.getCurrentTime() * this.videoInfo.fps));
        }
        return 0;
    }

    /* 動画から現在の光源位置を得る */
    getLightPosition(): Vector3 {
        if (!this.videoInfo) { return new Vector3(0, 0, 0); }
        const frameNo = this.getCurrentFrameNo();
        const frameInfo: FrameInfo = this.videoInfo.frameInfo[frameNo];
        if (!frameInfo) {
            console.error(`frameNo ${frameNo} is not contain frameInfo.`);
            return new Vector3(0, 0, 0);
        }
        //return this.sphericalToCartesian(frameInfo['lat'], frameInfo['lon'] - 110, 95);
        return this.sphericalToCartesian(frameInfo['lat'], frameInfo['lon'] - 180, 8);
    }

    /* 動画から現在の照度を得る(0.0～1.0) */
    getLightIntensity(): number {
        if (!this.videoInfo) { return 0; }
        const frameNo = this.getCurrentFrameNo();
        const frameInfo: FrameInfo = this.videoInfo.frameInfo[frameNo];
        if (!frameInfo) {
            console.error(`frameNo ${frameNo} is not contain frameInfo.`);
            return 0;
        }
        return frameInfo['brightness'] / 255;
    }

    /* 緯度・経度・半径から、直交座標を得る。 */
    private sphericalToCartesian(lat: number, lon: number, radius: number) {
        const latRad = MathUtils.degToRad(lat);
        const lonRad = MathUtils.degToRad(lon);
        const x = radius * Math.cos(latRad) * Math.cos(lonRad);
        const y = radius * Math.sin(latRad);
        const z = radius * Math.cos(latRad) * Math.sin(lonRad);
        return new Vector3(x, y, z);
    }
}
