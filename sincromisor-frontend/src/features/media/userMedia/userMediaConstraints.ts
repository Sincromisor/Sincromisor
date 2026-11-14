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

/** 次回取得と実行中の適用で共有する希望設定を更新する。音声無効時は変更しない。 */
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

/** 設定全体を元マイクへ適用し、変更項目の結果を設定UIへ通知する。 */
export function applyAudioBooleanConstraintToTrack(options: {
    config: MediaStreamConstraints;
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
    const audioConfig = options.config.audio;
    if (!audioConfig || typeof audioConfig === "boolean") return;
    // applyConstraintsは制約集合を置き換える。要求ごとの写しで後続変更から分離する。
    const constraints = structuredClone(audioConfig);
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
