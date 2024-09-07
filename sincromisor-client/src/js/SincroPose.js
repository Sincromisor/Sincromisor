import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export class SincroPose {
    constructor(targetVideoElement, width = 320, height = 240) {
        this.poseLandmarker = undefined;
        this.videoElement = targetVideoElement;
        this.lastVideoTime = -1;
        this.lastDetectedTime = -1;
        this.hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
        this.videoWidth = width;
        this.videoHeight = height;
        // Pose Landmarkは0～32番の33個
        this.movingAverage = [...Array(33)].map((v, i) => { return { 'x': 0.0, 'y': 0.0, 'z': 0.0 } })
        this.arriveCallback = null;
        this.leaveCallback = null;
    }

    // とりあえず鼻の位置(landmarkの0番目)を追跡する。
    targetX() {
        return this.movingAverage[0]["x"];
    }

    targetY() {
        return this.movingAverage[0]["y"];
    }

    targetZ() {
        return this.movingAverage[0]["y"];
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
        this.poseLandmarker = await PoseLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath: "/3rd_party/pose_landmarker_lite.task"
                },
                runningMode: "VIDEO",
                delegate: "GPU"
            });
    }

    modelIsLoaded() {
        if (!this.poseLandmarker) {
            return false;
        }
        return true;
    }

    async initCamera(videoTrack, callback) {
        if (!this.hasGetUserMedia) {
            console.error("This browser does not support getUserMedia.");
            return false;
        }
        if (!this.poseLandmarker) {
            console.error("Model is still loading. Please try again.");
            return false;
        }

        const videoStream = new MediaStream();
        videoStream.addTrack(videoTrack);
        this.videoElement.setAttribute("width", this.videoWidth);
        this.videoElement.setAttribute("height", this.videoHeight);
        this.videoElement.setAttribute("autoplay", true);
        this.videoElement.setAttribute("playsinline", true);
        this.videoElement.setAttribute("muted", true);
        //this.videoElement.style.display = "none";
        this.videoElement.srcObject = videoStream;
        this.videoElement.addEventListener("loadeddata", () => { this.predictCam(callback) });
        this.initEvent(this.videoElement);
        document.querySelector("body").appendChild(this.videoElement);
        return true;
    }

    async predictCam(callback) {
        const detectEvent = new Event("detect");
        let startTimeMs = performance.now();
        if (this.videoElement.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.videoElement.currentTime;
            const detections = this.poseLandmarker.detectForVideo(this.videoElement, startTimeMs);
            if (detections.worldLandmarks.length > 0) {
                this.updateKeypointsMovingAverage(detections.worldLandmarks[0]);
                this.lastDetectedTime = performance.now();
                this.videoElement.dispatchEvent(detectEvent);
                console.log(`${this.movingAverage[0]['z']}, ${this.movingAverage[23]['z']}, ${this.movingAverage[24]['z']}`);
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
            this.movingAverage[i]["z"] = (keypoints[i]["z"] + this.movingAverage[i]["z"]) / 2;
        }
    }

    // 顔認識した時・誰もいなくなった時のイベントを発行
    initEvent() {
        let currentStatus = false;
        const arriveEvent = new Event("arrive");
        const leaveEvent = new Event("leave");
        setInterval(() => {
            let newStatus = this.detecting();
            if (currentStatus != newStatus) {
                currentStatus = newStatus;
                if (newStatus) {
                    this.videoElement.dispatchEvent(arriveEvent);
                    if (this.arriveCallback) { this.arriveCallback() };
                } else {
                    this.videoElement.dispatchEvent(leaveEvent);
                    if (this.leaveCallback) { this.leaveCallback() };
                }
            }
        }, 200);

        //targetElement.addEventListener('arrive', ()=>{console.log('きました')});
        //targetElement.addEventListener('leave', ()=>{console.log('さようなら')});
    }
}
