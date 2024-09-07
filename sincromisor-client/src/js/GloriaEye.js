import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

export class GloriaEye {
    constructor(targetVideoElement, width = 320, height = 240) {
        this.faceDetector = undefined;
        this.videoElement = targetVideoElement;
        this.lastVideoTime = -1;
        this.lastDetectedTime = -1;
        this.detected = false;
        this.hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
        this.videoWidth = width;
        this.videoHeight = height;
        this.movingAverage = [...Array(6)].map((v, i) => { return { 'x': 0.0, 'y': 0.0 } })
        this.arriveCallback = () => { };
        this.leaveCallback = () => { };
    }

    // 顔のkeypointは、右目、左目、鼻、口、右耳、左耳の順に6要素の配列になっている。
    // とりあえず鼻の位置を追跡する。
    targetX() {
        return this.movingAverage[2]["x"];
    }

    targetY() {
        return this.movingAverage[2]["y"];
    }

    // 右目-鼻、左目-鼻の距離を基に、顔がこちらを向いているかを0.0～1.0の値で返す。
    // 0.5に近ければ近いほど、正面を向いている可能性が高い。
    facing() {
        const rightEye = this.movingAverage[0];
        const leftEye = this.movingAverage[1];
        const nose = this.movingAverage[2];
        const rEyeDist = Math.sqrt((rightEye["x"] - nose["x"]) ** 2 + (rightEye["y"] - nose["y"]) ** 2);
        const lEyeDist = Math.sqrt((leftEye["x"] - nose["x"]) ** 2 + (leftEye["y"] - nose["y"]) ** 2);
        return rEyeDist / (rEyeDist + lEyeDist);
    }

    // 5秒(5000ms)以内に顔が検知できていた場合はtrueを、それ以外はfalseを返す。
    detecting() {
        if (performance.now() - this.lastDetectedTime < 5000) {
            return true;
        }
        return false;
    }

    async initVision() {
        // https://developers.google.com/mediapipe/api/solutions/js/tasks-vision.facedetector
        // https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.js
        // https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.wasm
        const vision = await FilesetResolver.forVisionTasks(
            "/mediapipe/tasks-vision/wasm"
        );
        this.faceDetector = await FaceDetector.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath: "/3rd_party/blaze_face_short_range.tflite"
                },
                runningMode: "VIDEO",
                delegate: "GPU"
            });
    }

    modelIsLoaded() {
        if (!this.faceDetector) {
            return false;
        }
        return true;
    }

    async initCamera(videoTrack, callback) {
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
        this.videoElement.setAttribute("autoplay", true);
        this.videoElement.setAttribute("playsinline", true);
        this.videoElement.setAttribute("muted", true);
        this.videoElement.srcObject = videoStream;
        this.videoElement.addEventListener("loadeddata", () => { this.predictCam(callback) });
        return true;
    }

    async predictCam(callback) {
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
    updateKeypointsMovingAverage(keypoints) {
        for (let i = 0; i <= 5; i++) {
            this.movingAverage[i]["x"] = (keypoints[i]["x"] + this.movingAverage[i]["x"]) / 2;
            this.movingAverage[i]["y"] = (keypoints[i]["y"] + this.movingAverage[i]["y"]) / 2;
        }
    }

    // ニュートラルポジションにじわじわと戻す。
    // ToDo: 現状鼻だけ真ん中に戻ってしまうため、なんとかする。
    updateKeypointsMovingAverageToNeutral() {
        let deviation_x = 0.5 - this.movingAverage[2]["x"];
        let deviation_y = 0.5 - this.movingAverage[2]["y"];
        if (Math.abs(deviation_x) < 0.01 && Math.abs(deviation_y) < 0.01) { return; }
        this.movingAverage[2]["x"] = this.movingAverage[2]["x"] + deviation_x / 30;
        this.movingAverage[2]["y"] = this.movingAverage[2]["y"] + deviation_y / 30;
    }
}
