export type SincroRoiSide = "left" | "right" | "face";

export type SincroRoiSource =
    | "pose-wrist"
    | "pose-face"
    | "full-frame-fallback"
    | "previous"
    | "none";

export type SincroRoiWarningCode =
    | "roi_missing"
    | "roi_clamped"
    | "roi_too_small"
    | "roi_inconsistent"
    | "pose_not_detected"
    | "invalid_pose_point"
    | "low_pose_quality";

export type SincroRoiPoint = readonly [number, number];

export type SincroRoiRect = {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    clamped: boolean;
};

export type SincroRoiObservation = {
    side: SincroRoiSide;
    source: SincroRoiSource;
    rect: SincroRoiRect;
    confidence: number;
    referencePoint?: SincroRoiPoint;
    warnings: SincroRoiWarningCode[];
};
