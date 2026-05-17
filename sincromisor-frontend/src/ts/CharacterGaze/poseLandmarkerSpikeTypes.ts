import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export const DEFAULT_FACE_LANDMARKER_MODEL_PATH = "/3rd_party/face_landmarker.task";
export const MIN_VIDEO_DIMENSION_PX = 2;
export const SAMPLE_WINDOW_SIZE = 120;

export type PoseLandmarkerSpikeModelPreset = "lite" | "full" | "heavy" | "custom";

export type PoseLandmarkerSpikeConfig = {
    modelPreset: PoseLandmarkerSpikeModelPreset;
    modelAssetPath: string;
    targetInferenceFps: number;
    runFaceLandmarker: boolean;
    faceModelAssetPath?: string;
    delegate: "CPU" | "GPU";
};

export type PoseLandmarkerSpikeMetrics = {
    poseInferenceMs: number;
    poseInferenceAvgMs: number;
    poseInferenceMaxMs: number;
    poseInferenceFps: number;
    faceInferenceMs?: number;
    faceInferenceAvgMs?: number;
    renderFps: number;
    droppedVideoFrames?: number;
    detected: boolean;
    poseCount: number;
    trackedLandmarks: PoseLandmarkerSpikeTrackedLandmark[];
    fallbackReason?: string;
};

export type PoseLandmarkerSpikeTrackedLandmark = {
    name: string;
    x: number;
    y: number;
    z: number;
    visibility: number;
    stable: boolean;
};

export type PoseLandmarkerSpikeCallbacks = {
    onMetrics: (metrics: PoseLandmarkerSpikeMetrics) => void;
    onPoseResult: (result: PoseLandmarkerResult | undefined) => void;
    onStatus: (message: string) => void;
    onError: (error: unknown) => void;
};

export const POSE_LANDMARKER_SPIKE_MODEL_PATHS: Record<
    Exclude<PoseLandmarkerSpikeModelPreset, "custom">,
    string
> = {
    lite: "/3rd_party/pose_landmarker_lite.task",
    full: "/3rd_party/pose_landmarker_full.task",
    heavy: "/3rd_party/pose_landmarker_heavy.task",
};

export const DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG: PoseLandmarkerSpikeConfig = {
    modelPreset: "lite",
    modelAssetPath: POSE_LANDMARKER_SPIKE_MODEL_PATHS.lite,
    targetInferenceFps: 15,
    runFaceLandmarker: false,
    faceModelAssetPath: DEFAULT_FACE_LANDMARKER_MODEL_PATH,
    delegate: navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU",
};
