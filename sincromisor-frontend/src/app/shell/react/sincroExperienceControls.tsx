import { useEffect, useState } from "react";
import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import type { SincroAppController } from "../../controller";
import type { SincroAppMediaState } from "../../controller/sincroAppTypes";
import { subscribeActiveSincroAppEvents } from "../../react/subscribeActiveSincroAppEvents";

const unusedMedia: SincroAppMediaState = {
    experienceActive: false,
    microphone: "idle",
    camera: "idle",
};
const usageLabels = { idle: "未使用", requesting: "取得中", active: "使用中" };

/** 通常画面から所有者の機器状態を確認し、RTC停止と別に体験全体を終了する。 */
export function SincroExperienceControls() {
    const [media, setMedia] = useState(unusedMedia);
    const [controller, setController] = useState<SincroAppController>();
    useEffect(
        () =>
            subscribeActiveSincroAppEvents({
                onControllerChange: (next) => {
                    setController(next);
                    setMedia(unusedMedia);
                },
                onEvent: (event) => {
                    if (event.type === "media_state") setMedia(event.state);
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
