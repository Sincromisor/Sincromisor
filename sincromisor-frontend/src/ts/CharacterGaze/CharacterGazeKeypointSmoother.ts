import type { CharacterGazeTrackingTuning, NormalizedKeypoint } from "./characterGazeTypes";
import { OneEuroFilter1D } from "./OneEuroFilter";

const FACE_KEYPOINT_COUNT = 6;
const NOSE_KEYPOINT_INDEX = 2;

// 顔 keypoint の平滑化と、視線制御が読む派生値の計算を担当する。
export class CharacterGazeKeypointSmoother {
    private readonly keypointXFilters: OneEuroFilter1D[] = [...Array(FACE_KEYPOINT_COUNT)].map(
        () => new OneEuroFilter1D(1.0, 0.02, 1.0),
    );
    private readonly keypointYFilters: OneEuroFilter1D[] = [...Array(FACE_KEYPOINT_COUNT)].map(
        () => new OneEuroFilter1D(1.0, 0.02, 1.0),
    );
    private deadband: number;
    // デフォルトでは真正面を向くよう、すべての keypoint を画像中央に置く。
    readonly movingAverage: Array<{ x: number; y: number }> = [...Array(FACE_KEYPOINT_COUNT)].map(
        () => {
            return { x: 0.5, y: 0.5 };
        },
    );

    constructor(tuning: CharacterGazeTrackingTuning) {
        this.deadband = tuning.deadband;
        this.setTuning(tuning);
    }

    targetX(): number {
        return this.movingAverage[NOSE_KEYPOINT_INDEX].x;
    }

    targetY(): number {
        return this.movingAverage[NOSE_KEYPOINT_INDEX].y;
    }

    // 鼻の座標から、相手の目線の角度を計算する。
    eyeAngles(): [number, number] {
        const cameraPos: [number, number, number] = [0, 0, 0];
        const [faceX, faceY, faceZ] = [
            this.movingAverage[NOSE_KEYPOINT_INDEX].x - 0.5,
            this.movingAverage[NOSE_KEYPOINT_INDEX].y - 0.5,
            1,
        ];
        const vector: [number, number, number] = [
            faceX - cameraPos[0],
            faceY - cameraPos[1],
            faceZ - cameraPos[2],
        ];
        const depth = vector[2];
        const alpha = Math.atan2(vector[0], depth) * (180 / Math.PI);
        const beta = Math.atan2(vector[1], depth) * (180 / Math.PI);
        return [alpha, beta];
    }

    // 右目-鼻、左目-鼻の距離を基に、顔がこちらを向いているかを0.0～1.0の値で返す。
    facing(): number {
        const rightEye = this.movingAverage[0];
        const leftEye = this.movingAverage[1];
        const nose = this.movingAverage[NOSE_KEYPOINT_INDEX];
        const rEyeDist = Math.sqrt((rightEye.x - nose.x) ** 2 + (rightEye.y - nose.y) ** 2);
        const lEyeDist = Math.sqrt((leftEye.x - nose.x) ** 2 + (leftEye.y - nose.y) ** 2);
        return rEyeDist / (rEyeDist + lEyeDist);
    }

    setTuning(tuning: CharacterGazeTrackingTuning): void {
        this.deadband = tuning.deadband;
        for (const filter of this.keypointXFilters) {
            filter.setParams({
                minCutoff: tuning.oneEuroMinCutoff,
                beta: tuning.oneEuroBeta,
                dCutoff: tuning.oneEuroDCutoff,
            });
        }
        for (const filter of this.keypointYFilters) {
            filter.setParams({
                minCutoff: tuning.oneEuroMinCutoff,
                beta: tuning.oneEuroBeta,
                dCutoff: tuning.oneEuroDCutoff,
            });
        }
    }

    // keypoint の指数移動平均値を更新する。keypoints の値は 0.0～1.0。
    updateFromKeypoints(keypoints: NormalizedKeypoint[], timestampMs: number): void {
        for (let i = 0; i < FACE_KEYPOINT_COUNT; i++) {
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
    easeToNeutral(): void {
        const deviationX = 0.5 - this.movingAverage[NOSE_KEYPOINT_INDEX].x;
        const deviationY = 0.5 - this.movingAverage[NOSE_KEYPOINT_INDEX].y;
        if (Math.abs(deviationX) < 0.01 && Math.abs(deviationY) < 0.01) {
            return;
        }
        this.movingAverage[NOSE_KEYPOINT_INDEX].x += deviationX / 30;
        this.movingAverage[NOSE_KEYPOINT_INDEX].y += deviationY / 30;
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }

    // 微小な揺れは無視して、視線オーバーレイと首振りの細かいジッタを減らす。
    private applyDeadband(prev: number, next: number): number {
        return Math.abs(next - prev) < this.deadband ? prev : next;
    }
}
