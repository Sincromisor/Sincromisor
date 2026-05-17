import { type Detection, FaceDetector } from "@mediapipe/tasks-vision";
import { loadMediaPipeVisionFileset } from "../FaceTracking/MediaPipeVisionFileset";
import { frontendLogger } from "../logging/appLogger";
import { FaceTargetSelector } from "./FaceTargetSelector";
import { OneEuroFilter1D } from "./OneEuroFilter";

declare type NormalizedKeypoint = {
    /** X in normalized image coordinates. */
    x: number;
    /** Y in normalized image coordinates. */
    y: number;
    /** Optional label of the keypoint. */
    label?: string;
    /** Optional score of the keypoint. */
    score?: number;
};

const VIDEO_FRAME_STALE_MS = 1200;
const MIN_DETECTABLE_VIDEO_DIMENSION_PX = 2;

export class CharacterGaze {
    private static instance: CharacterGaze;
    private readonly videoElement: HTMLVideoElement;
    private faceDetector?: FaceDetector;
    private lastVideoTime: number = -1;
    private lastVideoFrameUpdatedAtMs: number = -1;
    private lastDetectedTime: number = -1;
    private detected: boolean = false;
    // デフォルトでは真正面を向くよう、
    // すべてのkeypointを画像中央となる0.5に設定する
    movingAverage: Array<{ x: number; y: number }> = [...Array(6)].map(() => {
        return { x: 0.5, y: 0.5 };
    });
    arriveCallback: () => void = () => {};
    leaveCallback: () => void = () => {};
    private predictionLoopEnabled: boolean = false;
    private predictionLoopRunning: boolean = false;
    private predictionFrameId?: number;
    private detectionCallback?: (detection: Detection[]) => void;
    private detectionErrorCallback?: (error: unknown) => void;
    private loadedDataHandlerBound?: () => void;
    private readonly faceTargetSelector = new FaceTargetSelector();
    // 6 keypoints (rightEye, leftEye, nose, mouth, rightEar, leftEar) の x/y を個別に平滑化する。
    private readonly keypointXFilters: OneEuroFilter1D[] = [...Array(6)].map(
        () => new OneEuroFilter1D(1.0, 0.02, 1.0),
    );
    private readonly keypointYFilters: OneEuroFilter1D[] = [...Array(6)].map(
        () => new OneEuroFilter1D(1.0, 0.02, 1.0),
    );
    private lastTargetDebugText = "-";
    private gazeTuning = {
        minimumHoldMs: 900,
        switchMargin: 0.15,
        relinkDistance: 0.2,
        oneEuroMinCutoff: 1.0,
        oneEuroBeta: 0.02,
        oneEuroDCutoff: 1.0,
        deadband: 0.0025,
    };

    static getManager(): CharacterGaze {
        if (!CharacterGaze.instance) {
            const chracterGazeVideo: HTMLVideoElement | null = document.querySelector(
                "video#characterGazeVideo",
            );
            if (!chracterGazeVideo) {
                throw "video#characterGazeVideo is not found.";
            }
            CharacterGaze.instance = new CharacterGaze(chracterGazeVideo);
        }
        return CharacterGaze.instance;
    }

    private constructor(targetVideoElement: HTMLVideoElement) {
        this.videoElement = targetVideoElement;
        this.arriveCallback = () => {};
        this.leaveCallback = () => {};
    }

    // ブラウザ権限/UI表示とは独立に、APIサポート有無だけを返す。
    hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    // 顔のkeypointは、右目、左目、鼻、口、右耳、左耳の順に6要素の配列になっている。
    // とりあえず鼻の位置を追跡する。
    targetX(): number {
        return this.movingAverage[2].x;
    }

    targetY(): number {
        return this.movingAverage[2].y;
    }

    // Debug Console の簡易表示用（複数人検出時の選択結果確認）。
    targetSelectionDebugText(): string {
        return this.lastTargetDebugText;
    }

    getTrackingTuning(): Readonly<typeof this.gazeTuning> {
        return this.gazeTuning;
    }

    setTrackingTuning(partial: Partial<typeof this.gazeTuning>): void {
        this.gazeTuning = {
            ...this.gazeTuning,
            ...partial,
        };
        this.faceTargetSelector.setTuning({
            minimumHoldMs: this.gazeTuning.minimumHoldMs,
            switchMargin: this.gazeTuning.switchMargin,
            relinkDistance: this.gazeTuning.relinkDistance,
        });
        for (const filter of this.keypointXFilters) {
            filter.setParams({
                minCutoff: this.gazeTuning.oneEuroMinCutoff,
                beta: this.gazeTuning.oneEuroBeta,
                dCutoff: this.gazeTuning.oneEuroDCutoff,
            });
        }
        for (const filter of this.keypointYFilters) {
            filter.setParams({
                minCutoff: this.gazeTuning.oneEuroMinCutoff,
                beta: this.gazeTuning.oneEuroBeta,
                dCutoff: this.gazeTuning.oneEuroDCutoff,
            });
        }
    }

    // 鼻の座標から、相手の目線の角度を計算する。
    eyeAngles(): [number, number] {
        const cameraPos: [number, number, number] = [0, 0, 0];
        const [faceX, faceY, faceZ] = [
            this.movingAverage[2].x - 0.5,
            this.movingAverage[2].y - 0.5,
            1,
        ];

        // カメラから点cへのベクトル
        const vector: [number, number, number] = [
            faceX - cameraPos[0],
            faceY - cameraPos[1],
            faceZ - cameraPos[2],
        ];

        // z軸に対する深さ
        const depth = vector[2];

        // 横方向の角度
        const alpha = Math.atan2(vector[0], depth) * (180 / Math.PI);

        // 縦方向の角度
        const beta = Math.atan2(vector[1], depth) * (180 / Math.PI);

        return [alpha, beta];
    }

    // 右目-鼻、左目-鼻の距離を基に、顔がこちらを向いているかを0.0～1.0の値で返す。
    // 0.5に近ければ近いほど、正面を向いている可能性が高い。
    facing(): number {
        const rightEye = this.movingAverage[0];
        const leftEye = this.movingAverage[1];
        const nose = this.movingAverage[2];
        const rEyeDist = Math.sqrt((rightEye.x - nose.x) ** 2 + (rightEye.y - nose.y) ** 2);
        const lEyeDist = Math.sqrt((leftEye.x - nose.x) ** 2 + (leftEye.y - nose.y) ** 2);
        return rEyeDist / (rEyeDist + lEyeDist);
    }

    // 5秒(5000ms)以内に顔が検知できていた場合はtrueを、それ以外はfalseを返す。
    detecting(): boolean {
        const nowMs = performance.now();
        if (
            this.lastVideoFrameUpdatedAtMs >= 0 &&
            nowMs - this.lastVideoFrameUpdatedAtMs > VIDEO_FRAME_STALE_MS
        ) {
            return false;
        }
        return nowMs - this.lastDetectedTime < 5000;
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

        const videoStream = new MediaStream();
        videoStream.addTrack(videoTrack);
        this.videoElement.setAttribute("autoplay", "true");
        this.videoElement.setAttribute("playsinline", "true");
        this.videoElement.setAttribute("muted", "true");
        this.videoElement.srcObject = videoStream;
        this.detectionCallback = callback;
        this.detectionErrorCallback = errorCallback;
        this.predictionLoopEnabled = true;
        if (!this.loadedDataHandlerBound) {
            this.loadedDataHandlerBound = () => {
                this.startPredictionLoopIfNeeded();
            };
            this.videoElement.addEventListener("loadeddata", this.loadedDataHandlerBound);
        }
        // 既にvideoがロード済みの状態で再開するケース（OFF->ON）にも対応する。
        this.lastVideoTime = -1;
        this.lastVideoFrameUpdatedAtMs = -1;
        this.lastDetectedTime = -1;
        this.startPredictionLoopIfNeeded();
        return true;
    }

    // CharacterGaze を完全停止し、preview video と内部状態を初期化する。
    // OFF 時やカメラ切替途中に呼び、次回の再取得を安全にする。
    detachCamera(): void {
        this.stopPredictionLoop();
        this.detectionCallback = undefined;
        this.detectionErrorCallback = undefined;
        this.detected = false;
        this.lastVideoTime = -1;
        this.lastVideoFrameUpdatedAtMs = -1;
        this.lastDetectedTime = -1;
        this.updateKeypointsMovingAverageToNeutral();
        this.videoElement.pause();
        this.videoElement.srcObject = null;
    }

    // Gaze OFF 時に顔検出ループだけを止める。video track 自体は他用途でも使うため停止しない。
    stopPredictionLoop(): void {
        this.predictionLoopEnabled = false;
        this.predictionLoopRunning = false;
        this.faceTargetSelector.reset();
        this.lastTargetDebugText = "停止中";
        if (this.predictionFrameId !== undefined) {
            window.cancelAnimationFrame(this.predictionFrameId);
            this.predictionFrameId = undefined;
        }
    }

    // 既に video/srcObject が設定済みの状態で、検出ループだけを再開する。
    // Gaze の OFF -> ON 切替時に使う。
    resumePredictionLoop(): void {
        this.predictionLoopEnabled = true;
        this.lastTargetDebugText = "-";
        this.startPredictionLoopIfNeeded();
    }

    private startPredictionLoopIfNeeded(): void {
        if (!this.predictionLoopEnabled || this.predictionLoopRunning) {
            return;
        }
        if (!this.detectionCallback) {
            return;
        }
        // HAVE_CURRENT_DATA(2) 以上なら loadeddata 待ち不要で再開できる。
        if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
        }
        if (!this.videoFrameIsReadyForDetection()) {
            this.predictionFrameId = window.requestAnimationFrame(() => {
                this.predictionFrameId = undefined;
                this.startPredictionLoopIfNeeded();
            });
            return;
        }
        this.predictionLoopRunning = true;
        void this.predictCam(this.detectionCallback);
    }

    // requestAnimationFrame ベースの顔検出ループ。
    // 検出状態変化（arrive/leave）と keypoint 平滑化をここで管理する。
    private async predictCam(callback: (detection: Detection[]) => void): Promise<void> {
        if (!this.predictionLoopEnabled) {
            this.predictionLoopRunning = false;
            this.predictionFrameId = undefined;
            return;
        }
        if (!this.faceDetector) {
            this.predictionLoopRunning = false;
            return;
        }
        const startTimeMs = performance.now();
        if (this.videoElement.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.videoElement.currentTime;
            this.lastVideoFrameUpdatedAtMs = startTimeMs;
            if (!this.videoFrameIsReadyForDetection()) {
                this.handleFrozenVideoFrame(startTimeMs, callback);
                this.scheduleNextPrediction(callback);
                return;
            }
            let detections: Detection[];
            try {
                detections = this.faceDetector.detectForVideo(
                    this.videoElement,
                    startTimeMs,
                ).detections;
            } catch (error) {
                this.handleDetectionRuntimeError(error);
                return;
            }

            if (detections.length > 0) {
                const selected = this.faceTargetSelector.select(detections, startTimeMs);
                this.lastTargetDebugText =
                    selected.selectedIndex === undefined
                        ? `候補:${selected.candidateCount}`
                        : `対象:${selected.selectedIndex} 候補:${selected.candidateCount} score:${(selected.selectedScore ?? 0).toFixed(2)}${selected.holdLocked ? " 固定中" : ""}`;
                if (selected.selectedIndex !== undefined) {
                    const targetDetection = detections[selected.selectedIndex];
                    this.updateKeypointsMovingAverage(
                        targetDetection.keypoints as NormalizedKeypoint[],
                        startTimeMs,
                    );
                    this.lastDetectedTime = performance.now();
                    this.videoElement.dispatchEvent(new Event("detect"));
                }
            } else {
                this.lastTargetDebugText = "対象なし";
            }
            // 直近検出時刻ベースで「在席/離席」を判定し、AutoMute 側イベントへ変換する。
            const newStatus = this.detecting();
            if (this.detected !== newStatus) {
                if (newStatus) {
                    frontendLogger.debug("Character gaze target arrived.");
                    this.arriveCallback();
                    this.videoElement.dispatchEvent(new Event("arrive"));
                } else {
                    frontendLogger.debug("Character gaze target left.");
                    this.leaveCallback();
                    this.videoElement.dispatchEvent(new Event("leave"));
                }
                this.detected = newStatus;
            }
            /* 誰もいなくなったらニュートラルポジションに戻す */
            if (!this.detected) {
                this.updateKeypointsMovingAverageToNeutral();
            }
            callback(detections);
        } else {
            /* 
                sincroDebugConsoleContainerをhideした際にvideoの再生が止まり、
                その影響で顔認識も止まってしまう問題を回避。
            */
            this.videoElement.play();
            this.handleFrozenVideoFrame(startTimeMs, callback);
        }
        this.scheduleNextPrediction(callback);
    }

    private videoFrameIsReadyForDetection(): boolean {
        // Firefox can fire loadeddata before decoded dimensions are stable. Passing a
        // zero-sized frame to MediaPipe may surface as a wasm index-out-of-bounds error.
        return (
            this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            this.videoElement.videoWidth >= MIN_DETECTABLE_VIDEO_DIMENSION_PX &&
            this.videoElement.videoHeight >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
        );
    }

    private scheduleNextPrediction(callback: (detection: Detection[]) => void): void {
        this.predictionFrameId = window.requestAnimationFrame(() => {
            void this.predictCam(callback);
        });
    }

    private handleDetectionRuntimeError(error: unknown): void {
        frontendLogger.error("CharacterGaze FaceDetector failed during video inference.", {
            error,
        });
        const wasDetected = this.detected;
        this.stopPredictionLoop();
        this.detected = false;
        this.lastTargetDebugText = "検出エラー";
        this.updateKeypointsMovingAverageToNeutral();
        if (wasDetected) {
            this.leaveCallback();
            this.videoElement.dispatchEvent(new Event("leave"));
        }
        this.detectionErrorCallback?.(error);
    }

    private selectFaceDetectorDelegate(): "CPU" | "GPU" {
        // MediaPipe GPU delegate may fail inside Firefox's wasm/WebGL pipeline with
        // RuntimeError: index out of bounds, so Firefox uses the more stable CPU path.
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }

    private handleFrozenVideoFrame(
        nowMs: number,
        callback: (detection: Detection[]) => void,
    ): void {
        if (
            this.lastVideoFrameUpdatedAtMs < 0 ||
            nowMs - this.lastVideoFrameUpdatedAtMs <= VIDEO_FRAME_STALE_MS
        ) {
            return;
        }
        this.lastTargetDebugText = "映像停止";
        this.updateKeypointsMovingAverageToNeutral();
        const newStatus = this.detecting();
        if (this.detected !== newStatus) {
            frontendLogger.debug("Character gaze target left after frozen video frame.");
            this.leaveCallback();
            this.videoElement.dispatchEvent(new Event("leave"));
            this.detected = newStatus;
        }
        callback([]);
    }

    // keypointの指数移動平均値を更新する
    // keypointsの値は0.0～1.0
    // 画像左端がX=0、上がY=0
    private updateKeypointsMovingAverage(
        keypoints: NormalizedKeypoint[],
        timestampMs: number,
    ): void {
        for (let i = 0; i <= 5; i++) {
            const rawX = this.clamp01(keypoints[i].x);
            const rawY = this.clamp01(keypoints[i].y);
            const filteredX = this.keypointXFilters[i].filter(rawX, timestampMs);
            const filteredY = this.keypointYFilters[i].filter(rawY, timestampMs);
            this.movingAverage[i].x = this.applyDeadband(
                this.movingAverage[i].x,
                this.clamp01(filteredX),
            );
            this.movingAverage[i].y = this.applyDeadband(
                this.movingAverage[i].y,
                this.clamp01(filteredY),
            );
        }
    }

    // ニュートラルポジションにじわじわと戻す。
    // ToDo: 現状鼻だけ真ん中に戻ってしまうため、なんとかする。
    private updateKeypointsMovingAverageToNeutral(): void {
        const deviation_x = 0.5 - this.movingAverage[2].x;
        const deviation_y = 0.5 - this.movingAverage[2].y;
        if (Math.abs(deviation_x) < 0.01 && Math.abs(deviation_y) < 0.01) {
            return;
        }
        this.movingAverage[2].x = this.movingAverage[2].x + deviation_x / 30;
        this.movingAverage[2].y = this.movingAverage[2].y + deviation_y / 30;
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }

    // 微小な揺れは無視して、視線オーバーレイと首振りの細かいジッタを減らす。
    private applyDeadband(prev: number, next: number): number {
        return Math.abs(next - prev) < this.gazeTuning.deadband ? prev : next;
    }
}
