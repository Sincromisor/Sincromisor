export type NormalizedKeypoint = {
    /** X in normalized image coordinates. */
    x: number;
    /** Y in normalized image coordinates. */
    y: number;
    /** Optional label of the keypoint. */
    label?: string;
    /** Optional score of the keypoint. */
    score?: number;
};

export type CharacterGazeTrackingTuning = {
    minimumHoldMs: number;
    switchMargin: number;
    relinkDistance: number;
    oneEuroMinCutoff: number;
    oneEuroBeta: number;
    oneEuroDCutoff: number;
    deadband: number;
};

export const DEFAULT_CHARACTER_GAZE_TRACKING_TUNING: CharacterGazeTrackingTuning = {
    minimumHoldMs: 900,
    switchMargin: 0.15,
    relinkDistance: 0.2,
    oneEuroMinCutoff: 1.0,
    oneEuroBeta: 0.02,
    oneEuroDCutoff: 1.0,
    deadband: 0.0025,
};
