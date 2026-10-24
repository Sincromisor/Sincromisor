import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import {
    connectionStatusLabel,
    createStartupOptionHint,
    createTalkModeReconnectHint,
} from "../../../features/settings/react/sections/settingsConnectionText";
import type { SincroControlPanelPageProps } from "./sincroControlPanelTypes";

/** 診断値を含めず、全分類から見える共通領域に接続状態と操作を置く。 */
export function ConnectionSettingsPage({ panelState }: SincroControlPanelPageProps) {
    return (
        <div className="settingsPrimitiveFieldStack">
            <ConnectionStatusCard
                value={panelState.connectionState.value}
                detail={panelState.connectionState.detail ?? ""}
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
