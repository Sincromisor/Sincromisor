import { frontendLogger } from "../../../shared/logging/appLogger";
import type { AudioConstraintRuntimeApplyReport } from "./userMediaTypes";

export type AudioBooleanConstraintKey = "autoGainControl" | "noiseSuppression" | "echoCancellation";

export function setAudioInputDeviceIdInConfig(
    config: MediaStreamConstraints,
    deviceId: string | undefined,
): void {
    const audioConfig = config.audio;
    if (!audioConfig || typeof audioConfig === "boolean") {
        return;
    }
    if (deviceId && deviceId.trim() !== "") {
        audioConfig.deviceId = { exact: deviceId };
        return;
    }
    delete audioConfig.deviceId;
}

export function getAudioInputDeviceIdFromConfig(
    config: MediaStreamConstraints,
): string | undefined {
    const audioConfig = config.audio;
    if (!audioConfig || typeof audioConfig === "boolean") {
        return undefined;
    }
    const deviceIdConstraint = audioConfig.deviceId;
    if (typeof deviceIdConstraint === "string") {
        return deviceIdConstraint;
    }
    if (
        deviceIdConstraint &&
        typeof deviceIdConstraint === "object" &&
        "exact" in deviceIdConstraint &&
        typeof deviceIdConstraint.exact === "string"
    ) {
        return deviceIdConstraint.exact;
    }
    return undefined;
}

export function setAudioBooleanConstraintInConfig(
    config: MediaStreamConstraints,
    key: AudioBooleanConstraintKey,
    enabled: boolean,
): boolean {
    const audioConfig = config.audio;
    if (!audioConfig || typeof audioConfig === "boolean") {
        return false;
    }
    audioConfig[key] = enabled;
    return true;
}

export function createAudioOnlyConstraints(config: MediaStreamConstraints): MediaStreamConstraints {
    const audioConfig = config.audio;
    return {
        audio: typeof audioConfig === "boolean" ? audioConfig : { ...audioConfig },
        video: false,
    };
}

export function applyAudioBooleanConstraintToTrack(options: {
    key: AudioBooleanConstraintKey;
    enabled: boolean;
    rawTrack: MediaStreamTrack | undefined;
    onReport: (report: AudioConstraintRuntimeApplyReport) => void;
}): void {
    const { key, enabled, rawTrack, onReport } = options;
    if (!rawTrack) {
        onReport({
            key,
            enabled,
            status: "pending",
            message: "マイク開始後に適用",
        });
        return;
    }
    const constraints: MediaTrackConstraints = {};
    constraints[key] = enabled;
    void rawTrack
        .applyConstraints(constraints)
        .then(() => {
            onReport({ key, enabled, status: "applied" });
        })
        .catch((err) => {
            frontendLogger.warn("Failed to apply audio constraint to running track.", {
                key,
                error: err,
            });
            onReport({
                key,
                enabled,
                status: "failed",
                message: err instanceof Error ? err.message : String(err),
            });
        });
}
