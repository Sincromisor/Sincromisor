import { useEffect, useState } from "react";
import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import type { SincroAppController } from "../../controller";
import type { SincroAppMediaState } from "../../controller/sincroAppTypes";
import {
    audioInputFailureMessage,
    type SincroAudioInputState,
} from "../../controller/sincroAudioInputState";
import { subscribeActiveSincroAppEvents } from "../../react/subscribeActiveSincroAppEvents";

const unusedMedia: SincroAppMediaState = {
    experienceActive: false,
    microphone: "idle",
    camera: "idle",
};
const usageLabels = { idle: "未使用", requesting: "取得中", active: "使用中" };

/** 実際の機器状態と音声だけの回復を示し、RTC停止と別に体験全体を終了する。 */
export function SincroExperienceControls() {
    const [media, setMedia] = useState(unusedMedia);
    const [audioInput, setAudioInput] = useState<SincroAudioInputState>({ status: "idle" });
    const [controller, setController] = useState<SincroAppController>();
    useEffect(
        () =>
            subscribeActiveSincroAppEvents({
                onControllerChange: (next) => {
                    setController(next);
                    setMedia(unusedMedia);
                    setAudioInput({ status: "idle" });
                },
                onEvent: (event) => {
                    if (event.type === "media_state") setMedia(event.state);
                    if (event.type === "audio_input_state") setAudioInput(event.state);
                },
            }),
        [],
    );
    const canEnd = media.experienceActive || media.microphone !== "idle" || media.camera !== "idle";
    return (
        <div className="sincroExperienceControls">
            <div
                className="sincroExperienceControls__usage"
                role="status"
                aria-label="機器の使用状態"
            >
                <span>マイク {usageLabels[media.microphone]}</span>
                <span>カメラ {usageLabels[media.camera]}</span>
            </div>
            {audioInput.status === "failed" ? (
                <>
                    <span role="status">{audioInputFailureMessage(audioInput.reason)}</span>
                    <SettingsButton
                        type="button"
                        onClick={() => controller?.retryAudioInput()}
                        disabled={!controller}
                    >
                        マイクを再試行
                    </SettingsButton>
                </>
            ) : null}
            <SettingsButton
                type="button"
                disabled={!controller}
                onClick={() => {
                    if (canEnd) controller?.endExperience();
                    else controller?.start();
                }}
            >
                {canEnd ? "体験を終了" : "体験を開始"}
            </SettingsButton>
        </div>
    );
}
