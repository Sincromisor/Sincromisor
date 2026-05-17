import { LinearFilter, RGBFormat, SRGBColorSpace } from "three/src/constants.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { VideoTexture } from "three/src/textures/VideoTexture.js";

/* フレーム毎の光源の情報 */
type FrameInfo = {
    frameID: number;
    x: number;
    y: number;
    lon: number;
    lat: number;
    brightness: number;
};

type VideoInfo = {
    fps: number;
    totalFrames: number;
    totalDuration: number;
    frameInfo: Array<FrameInfo>;
};

// 360背景動画の読み込みと、動画解析結果（光源位置/照度）の参照を担当するクラス。
// VRM360Scene はこのクラスから「背景テクスチャ」と「簡易ライト推定値」を受け取る。
export class SphereVideo {
    readonly videoElement: HTMLVideoElement;
    readonly videoTexture: VideoTexture;
    private readonly videoPath: string = "/media/hls";
    private videoInfo?: VideoInfo;
    private videoType: "file" | "live";

    /*
        videoID: file/VIDEONAME, live/VIDEONAMEのいずれか。VIDEONAMEは動画のID。
    */
    constructor(videoID: string) {
        this.videoType = this.getVideoType(videoID);
        this.videoElement = this.createVideoElement(videoID);
        this.videoTexture = this.createVideoTexture(this.videoElement);

        /* Live配信では光源の処理は行わない */
        if (this.videoType === "file") {
            this.getVideoInfo(videoID);
        }
    }

    /* videoIDから、fileかliveかを判定する */
    private getVideoType(videoID: string): "file" | "live" {
        if (videoID.startsWith("file/")) {
            return "file";
        } else if (videoID.startsWith("live/")) {
            return "live";
        } else {
            throw new Error(`Invalid videoID: ${videoID}`);
        }
    }

    // 事前解析済みのフレーム光源情報を取得する（file動画のみ）。
    private async getVideoInfo(videoID: string): Promise<void> {
        await fetch(`${this.videoPath}/${videoID}/movie.json`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then((info: VideoInfo) => {
                console.log(info);
                this.videoInfo = info;
            })
            .catch((e) => {
                console.error(e);
            });
    }

    // HLS動画を hidden video 要素として再生し、Three.js の VideoTexture 入力に使う。
    private createVideoElement(videoID: string): HTMLVideoElement {
        const video: HTMLVideoElement = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.loop = true;
        // video.muted = true; // 音声をミュートする
        video.style.display = "none"; // 動画を画面に表示しない
        video.autoplay = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        void this.loadHls(video, `${this.videoPath}/${videoID}/index.m3u8`);
        return video;
    }

    // 背景球の色味がくすまないよう SRGB とフィルタ設定を明示する。
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
            return Math.floor(this.getCurrentTime() * this.videoInfo.fps);
        }
        return 0;
    }

    /* 動画から現在の光源位置を得る */
    // 360背景に合わせた簡易照明として使うため、座標はシーン向けに変換して返す。
    getLightPosition(): Vector3 {
        if (!this.videoInfo) {
            return new Vector3(0, 0, 0);
        }
        const frameNo = this.getCurrentFrameNo();
        const frameInfo: FrameInfo = this.videoInfo.frameInfo[frameNo];
        if (!frameInfo) {
            console.error(`frameNo ${frameNo} is not contain frameInfo.`);
            return new Vector3(0, 0, 0);
        }
        //return this.sphericalToCartesian(frameInfo['lat'], frameInfo['lon'] - 110, 95);
        return this.sphericalToCartesian(frameInfo.lat, frameInfo.lon - 180, 8);
    }

    /* 動画から現在の照度を得る(0.0～1.0)。デフォルトは1.0 */
    getLightIntensity(): number {
        if (!this.videoInfo) {
            return 1.0;
        }
        const frameNo = this.getCurrentFrameNo();
        const frameInfo: FrameInfo = this.videoInfo.frameInfo[frameNo];
        if (!frameInfo) {
            console.error(`frameNo ${frameNo} is not contain frameInfo.`);
            return 0;
        }
        return frameInfo.brightness / 255;
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

    // hls.js は VRM360 動画再生時のみ必要なため、初期バンドル肥大化を避けるために遅延ロードする。
    // live/file 両対応だが、ライト推定の利用は file 動画のみ。
    private async loadHls(video: HTMLVideoElement, m3u8Path: string): Promise<void> {
        const retryPause: number = 5000;
        console.log(`Loading HLS stream from: ${m3u8Path}`);
        const { default: Hls } = await import("hls.js");
        if (Hls.isSupported() && !this.isIOS()) {
            const hls = new Hls({
                maxLiveSyncPlaybackRate: 1.5,
            });

            hls.on(Hls.Events.ERROR, (_evt, data) => {
                console.error(`HLS error: ${data.type} - ${data.details} - ${data.fatal}`);
                if (data.fatal) {
                    hls.destroy();

                    if (data.details === "manifestIncompatibleCodecsError") {
                        console.error(
                            "stream makes use of codecs which are not compatible with this browser or operative system",
                        );
                    } else if (data.response && data.response.code === 404) {
                        console.error("stream not found, retrying in some seconds");
                    } else {
                        console.error(`${data.error}, retrying in some seconds`);
                    }

                    setTimeout(() => {
                        void this.loadHls(video, m3u8Path);
                    }, retryPause);
                }
            });

            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                console.log("HLS media attached");
                hls.loadSource(`${m3u8Path}${window.location.search}`);
            });

            hls.on(Hls.Events.MANIFEST_LOADED, () => {
                console.log("HLS manifest loaded");
                video.play();
            });

            video.onplay = () => {
                /* ライブ配信の場合、最新の映像が見れるようliveSyncPositionまでシークする */
                if (this.videoType === "live") {
                    const pos: number | null = hls.liveSyncPosition;
                    if (pos !== null) {
                        video.currentTime = pos;
                    }
                }
            };

            hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            fetch(m3u8Path).then(() => {
                video.src = m3u8Path;
                video.play();
            });
        }
    }

    private isIOS(): boolean {
        return (
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.userAgent.includes("Mac") &&
                !!navigator.maxTouchPoints &&
                navigator.maxTouchPoints > 1)
        );
    }
}
