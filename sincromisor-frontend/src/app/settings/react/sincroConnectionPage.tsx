import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import {
    connectionStatusLabel,
    createStartupOptionHint,
    createTalkModeReconnectHint,
} from "../../../features/settings/react/sections/settingsConnectionText";
import { useSincroExperienceState } from "../../react/useSincroExperienceState";
import type { SincroControlPanelPageProps } from "./sincroControlPanelTypes";

const usageLabels = { idle: "未使用", requesting: "取得中", active: "使用中" };

/** 全分類から見える固定領域に実機器の使用状態と、RTCだけの接続操作を置く。 */
export function ConnectionSettingsPage({ panelState }: SincroControlPanelPageProps) {
    const { media } = useSincroExperienceState();
    return (
        <div className="settingsPrimitiveFieldStack">
            <div className="settingsPrimitiveButtonRow" role="status" aria-label="機器の使用状態">
                <span>マイク {usageLabels[media.microphone]}</span>
                <span>カメラ {usageLabels[media.camera]}</span>
            </div>
            <ConnectionStatusCard
                value={panelState.connectionState.value}
                // 失敗理由は重要通知に一度だけ表示し、固定領域には状態名と既存の再試行を残す。
                detail={
                    panelState.connectionState.value === "input_failed"
                        ? ""
                        : (panelState.connectionState.detail ?? "")
                }
                startupOptionHint={createStartupOptionHint(panelState.startupSettingsStatus)}
            />
            {createTalkModeReconnectHint(panelState.lifecycleState) ? (
                <p className="settingsPrimitiveFieldDescription">
                    {createTalkModeReconnectHint(panelState.lifecycleState)}
                </p>
            ) : null}
            <ConnectionActionButtons panelState={panelState} />
        </div>
    );
}

type ConnectionStatusCardProps = {
    value: string;
    detail: string;
    startupOptionHint: string;
};

function ConnectionStatusCard({ value, detail, startupOptionHint }: ConnectionStatusCardProps) {
    return (
        <div className="settingsPrimitiveConnectionStatus" role="status">
            <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{connectionStatusLabel(value)}</div>
            {detail ? <div style={{ opacity: 0.78, lineHeight: 1.45 }}>{detail}</div> : null}
            {startupOptionHint ? (
                <div style={{ opacity: 0.72, lineHeight: 1.45 }}>{startupOptionHint}</div>
            ) : null}
        </div>
    );
}

function ConnectionActionButtons({ panelState }: SincroControlPanelPageProps) {
    const inputFailed = panelState.connectionState.value === "input_failed";
    const alreadyStarting =
        panelState.lifecycleState === "starting" || panelState.lifecycleState === "running";
    return (
        <div className="settingsPrimitiveButtonRow">
            <SettingsButton
                type="button"
                tone="primary"
                onClick={panelState.startAction}
                disabled={!panelState.hasActiveController || (alreadyStarting && !inputFailed)}
            >
                {inputFailed ? "マイクを再試行" : "会話を開始"}
            </SettingsButton>
            <SettingsButton
                type="button"
                onClick={panelState.stopAction}
                disabled={!panelState.hasActiveController}
            >
                接続を停止
            </SettingsButton>
        </div>
    );
}
