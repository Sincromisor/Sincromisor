import { type Detection, FaceDetector } from "@mediapipe/tasks-vision";
import { frontendLogger } from "../../../shared/logging/appLogger";
import { loadMediaPipeVisionFileset } from "../trackingRuntime/mediaPipeVisionFileset";
import { CharacterGazeKeypointSmoother } from "./characterGazeKeypointSmoother";
import { CharacterGazePredictionLoop } from "./characterGazePredictionLoop";
import {
    type CharacterGazeTrackingTuning,
    DEFAULT_CHARACTER_GAZE_TRACKING_TUNING,
} from "./characterGazeTypes";
import { FaceTargetSelector } from "./faceTargetSelector";

export class CharacterGaze {
    private static instance: CharacterGaze;
    private readonly videoElement: HTMLVideoElement;
    private faceDetector?: FaceDetector;
    arriveCallback: () => void = () => {};
    leaveCallback: () => void = () => {};
    private readonly faceTargetSelector = new FaceTargetSelector();
    private gazeTuning: CharacterGazeTrackingTuning = DEFAULT_CHARACTER_GAZE_TRACKING_TUNING;
    private readonly keypointSmoother = new CharacterGazeKeypointSmoother(this.gazeTuning);
    private readonly predictionLoop: CharacterGazePredictionLoop;

    static getManager(): CharacterGaze {
        if (!CharacterGaze.instance) {
            const chracterGazeVideo: HTMLVideoElement | null = document.querySelector(
                "video#characterGazeVideo",
            );
            if (!chracterGazeVideo) {
                throw new Error("video#characterGazeVideo is not found.");
            }
            CharacterGaze.instance = new CharacterGaze(chracterGazeVideo);
        }
        return CharacterGaze.instance;
    }

    private constructor(targetVideoElement: HTMLVideoElement) {
        this.videoElement = targetVideoElement;
        this.arriveCallback = () => {};
        this.leaveCallback = () => {};
        this.predictionLoop = new CharacterGazePredictionLoop({
            videoElement: this.videoElement,
            keypointSmoother: this.keypointSmoother,
            faceTargetSelector: this.faceTargetSelector,
            getFaceDetector: () => this.faceDetector,
            getArriveCallback: () => this.arriveCallback,
            getLeaveCallback: () => this.leaveCallback,
        });
    }

    // ブラウザ権限/UI表示とは独立に、APIサポート有無だけを返す。
    hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    // 顔のkeypointは、右目、左目、鼻、口、右耳、左耳の順に6要素の配列になっている。
    // とりあえず鼻の位置を追跡する。
    targetX(): number {
        return this.keypointSmoother.targetX();
    }

    targetY(): number {
        return this.keypointSmoother.targetY();
    }

    // Debug Console の簡易表示用（複数人検出時の選択結果確認）。
    targetSelectionDebugText(): string {
        return this.predictionLoop.targetSelectionDebugText();
    }

    getTrackingTuning(): Readonly<CharacterGazeTrackingTuning> {
        return this.gazeTuning;
    }

    setTrackingTuning(partial: Partial<CharacterGazeTrackingTuning>): void {
        this.gazeTuning = {
            ...this.gazeTuning,
            ...partial,
        };
        this.faceTargetSelector.setTuning({
            minimumHoldMs: this.gazeTuning.minimumHoldMs,
            switchMargin: this.gazeTuning.switchMargin,
            relinkDistance: this.gazeTuning.relinkDistance,
        });
        this.keypointSmoother.setTuning(this.gazeTuning);
    }

    // 鼻の座標から、相手の目線の角度を計算する。
    eyeAngles(): [number, number] {
        return this.keypointSmoother.eyeAngles();
    }

    // 右目-鼻、左目-鼻の距離を基に、顔がこちらを向いているかを0.0～1.0の値で返す。
    // 0.5に近ければ近いほど、正面を向いている可能性が高い。
    facing(): number {
        return this.keypointSmoother.facing();
    }

    // 5秒(5000ms)以内に顔が検知できていた場合はtrueを、それ以外はfalseを返す。
    detecting(): boolean {
        return this.predictionLoop.detecting();
    }

    // MediaPipe FaceDetector のロード。
    // 実際のカメラ開始(initCamera)とは分離し、モデル読込完了待ちリトライを上位 controller で制御する。
    async initVision(): Promise<void> {
        // https://developers.google.com/mediapipe/api/solutions/js/tasks-vision.facedetector
        // https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.js
        // https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.wasm
        const vision = await loadMediaPipeVisionFileset();
        this.faceDetector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "/3rd_party/blaze_face_short_range.tflite",
                delegate: this.selectFaceDetectorDelegate(),
            },
            runningMode: "VIDEO",
        });
    }

    // 上位の開始リトライ制御用。FaceDetector 生成完了のみを判定する。
    modelIsLoaded(): boolean {
        if (!this.faceDetector) {
            return false;
        }
        return true;
    }

    // 既存の video#characterGazeVideo にトラックを接続し、検出ループを開始する。
    // callback は Debug/React 向けの可視化と eyeTarget 表示更新に使われる。
    async initCamera(
        videoTrack: MediaStreamTrack,
        callback: (detection: Detection[]) => void,
        errorCallback?: (error: unknown) => void,
    ): Promise<boolean> {
        if (!this.hasGetUserMedia()) {
            frontendLogger.error("This browser does not support getUserMedia.");
            return false;
        }
        if (!this.faceDetector) {
            frontendLogger.warn("Character gaze model is still loading.");
            return false;
        }

        this.predictionLoop.attachCamera(videoTrack, callback, errorCallback);
        return true;
    }

    // CharacterGaze を完全停止し、preview video と内部状態を初期化する。
    // OFF 時やカメラ切替途中に呼び、次回の再取得を安全にする。
    detachCamera(): void {
        this.predictionLoop.detachCamera();
    }

    // Gaze OFF 時に顔検出ループだけを止める。video track 自体は他用途でも使うため停止しない。
    stopPredictionLoop(): void {
        this.predictionLoop.stopPredictionLoop();
    }

    // 既に video/srcObject が設定済みの状態で、検出ループだけを再開する。
    // Gaze の OFF -> ON 切替時に使う。
    resumePredictionLoop(): void {
        this.predictionLoop.resumePredictionLoop();
    }

    private selectFaceDetectorDelegate(): "CPU" | "GPU" {
        // MediaPipe GPU delegate may fail inside Firefox's wasm/WebGL pipeline with
        // RuntimeError: index out of bounds, so Firefox uses the more stable CPU path.
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }
}
