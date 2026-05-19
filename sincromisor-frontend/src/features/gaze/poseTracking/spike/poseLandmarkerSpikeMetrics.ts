import type { NormalizedLandmark, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { PoseLandmarkerSpikeTrackedLandmark } from "./poseLandmarkerSpikeTypes";

type LandmarkIndex = {
    name: string;
    index: number;
};

const TRACKED_UPPER_BODY_LANDMARKS: LandmarkIndex[] = [
    { name: "left_shoulder", index: 11 },
    { name: "right_shoulder", index: 12 },
    { name: "left_elbow", index: 13 },
    { name: "right_elbow", index: 14 },
    { name: "left_wrist", index: 15 },
    { name: "right_wrist", index: 16 },
    { name: "left_hip", index: 23 },
    { name: "right_hip", index: 24 },
];

export function extractTrackedLandmarks(
    landmarks: NormalizedLandmark[],
): PoseLandmarkerSpikeTrackedLandmark[] {
    return TRACKED_UPPER_BODY_LANDMARKS.map((landmark) => {
        const value = landmarks[landmark.index];
        return {
            name: landmark.name,
            x: value?.x ?? 0,
            y: value?.y ?? 0,
            z: value?.z ?? 0,
            visibility: value?.visibility ?? 0,
            stable: (value?.visibility ?? 0) >= 0.5,
        };
    });
}

export function averageSample(samples: number[]): number {
    if (samples.length === 0) {
        return 0;
    }
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

export function poseLandmarkerDetected(poseResult: PoseLandmarkerResult): boolean {
    return poseResult.landmarks.length > 0;
}
