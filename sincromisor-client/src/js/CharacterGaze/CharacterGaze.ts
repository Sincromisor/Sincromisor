import { FilesetResolver, FaceDetector, Detection } from "@mediapipe/tasks-vision";

declare interface NormalizedKeypoint {
    /** X in normalized image coordinates. */
    x: number;
    /** Y in normalized image coordinates. */
    y: number;
    /** Optional label of the keypoint. */
    label?: string;
    /** Optional score of the keypoint. */
    score?: number;
}

export class CharacterGaze {
    videoElement: HTMLVideoElement;
    faceDetector: FaceDetector | null = null;
    lastVideoTime: number = -1;
    lastDetectedTime: number = -1;
    detected: boolean = false;
    videoWidth: number;
    videoHeight: number;
    movingAverage: Array<{ 'x': number, 'y': number }> = [...Array(6)].map(() => { return { 'x': 0.0, 'y': 0.0 } });
    arriveCallback: () => void = () => { };
    leaveCallback: () => void = () => { };

    constructor(targetVideoElement: HTMLVideoElement, width: number = 320, height: number = 240) {
        this.videoElement = targetVideoElement;
        this.videoWidth = width;
        this.videoHeight = height;
        this.arriveCallback = () => { };
        this.leaveCallback = () => { };
    }

    hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    // 顔のkeypointは、右目、左目、鼻、口、右耳、左耳の順に6要素の配列になっている。
    // とりあえず鼻の位置を追跡する。
    targetX(): number {
        return this.movingAverage[2]["x"];
    }

    targetY(): number {
        return this.movingAverage[2]["y"];
    }


    // 鼻の座標から、相手の目線の角度を計算する。
    eyeAngles(): [number, number] {
        const cameraPos: [number, number, number] = [0, 0, 0];
        const [faceX, faceY, faceZ] = [this.movingAverage[2]["x"] - 0.5, this.movingAverage[2]["y"] - 0.5, 1];

        // カメラから点cへのベクトル
        const vector: [number, number, number] = [faceX - cameraPos[0], faceY - cameraPos[1], faceZ - cameraPos[2]];

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
        const rEyeDist = Math.sqrt((rightEye["x"] - nose["x"]) ** 2 + (rightEye["y"] - nose["y"]) ** 2);
        const lEyeDist = Math.sqrt((leftEye["x"] - nose["x"]) ** 2 + (leftEye["y"] - nose["y"]) ** 2);
        return rEyeDist / (rEyeDist + lEyeDist);
    }

    // 5秒(5000ms)以内に顔が検知できていた場合はtrueを、それ以外はfalseを返す。
    detecting(): boolean {
        if (performance.now() - this.lastDetectedTime < 5000) {
            return true;
        }
        return false;
    }

    async initVision(): Promise<void> {
        // https://developers.google.com/mediapipe/api/solutions/js/tasks-vision.facedetector
        // https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.js
        // https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.wasm
        const vision = await FilesetResolver.forVisionTasks(
            "/mediapipe-wasm"
        );
        this.faceDetector = await FaceDetector.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath: "/3rd_party/blaze_face_short_range.tflite",
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
            });
    }

    modelIsLoaded(): boolean {
        if (!this.faceDetector) {
            return false;
        }
        return true;
    }

    async initCamera(videoTrack: MediaStreamTrack, callback: (detection: Detection[]) => void): Promise<boolean> {
        if (!this.hasGetUserMedia) {
            console.error("This browser does not support getUserMedia.");
            return false;
        }
        if (!this.faceDetector) {
            console.error("Model is still loading. Please try again.");
            return false;
        }

        const videoStream = new MediaStream();
        videoStream.addTrack(videoTrack);
        this.videoElement.setAttribute("autoplay", 'true');
        this.videoElement.setAttribute("playsinline", 'true');
        this.videoElement.setAttribute("muted", 'true');
        this.videoElement.srcObject = videoStream;
        this.videoElement.addEventListener("loadeddata", () => { this.predictCam(callback) });
        return true;
    }

    private async predictCam(callback: (detection: Detection[]) => void): Promise<void> {
        if (!this.faceDetector) {
            return;
        }
        const startTimeMs = performance.now();
        if (this.videoElement.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.videoElement.currentTime;
            const detections = this.faceDetector.detectForVideo(this.videoElement, startTimeMs).detections;

            if (detections.length > 0) {
                this.updateKeypointsMovingAverage(detections[0].keypoints);
                this.lastDetectedTime = performance.now();
                this.videoElement.dispatchEvent(new Event("detect"));
            }
            const newStatus = this.detecting();
            if (this.detected != newStatus) {
                if (newStatus) {
                    console.log("arrive!");
                    this.arriveCallback();
                    this.videoElement.dispatchEvent(new Event("arrive"));
                } else {
                    console.log("leave!");
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
        }
        window.requestAnimationFrame(() => { this.predictCam(callback) });
    }

    // keypointの指数移動平均値を更新する
    // keypointsの値は0.0～1.0
    // 画像左端がX=0、上がY=0
    private updateKeypointsMovingAverage(keypoints: NormalizedKeypoint[]): void {
        for (let i = 0; i <= 5; i++) {
            this.movingAverage[i]["x"] = (keypoints[i]["x"] + this.movingAverage[i]["x"]) / 2;
            this.movingAverage[i]["y"] = (keypoints[i]["y"] + this.movingAverage[i]["y"]) / 2;
        }
    }

    // ニュートラルポジションにじわじわと戻す。
    // ToDo: 現状鼻だけ真ん中に戻ってしまうため、なんとかする。
    private updateKeypointsMovingAverageToNeutral(): void {
        let deviation_x = 0.5 - this.movingAverage[2]["x"];
        let deviation_y = 0.5 - this.movingAverage[2]["y"];
        if (Math.abs(deviation_x) < 0.01 && Math.abs(deviation_y) < 0.01) { return; }
        this.movingAverage[2]["x"] = this.movingAverage[2]["x"] + deviation_x / 30;
        this.movingAverage[2]["y"] = this.movingAverage[2]["y"] + deviation_y / 30;
    }
}
