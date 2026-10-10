import {
    connectionStatusLabel,
    createStartupOptionHint,
} from "../../../features/settings/react/sections/settingsConnectionText";
import { panelStyles } from "./panelStyles";
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
        <div
            style={{
                display: "grid",
                gap: "6px",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(157, 176, 204, 0.14)",
                background: "rgba(255,255,255,0.03)",
            }}
        >
            <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{connectionStatusLabel(value)}</div>
            {detail ? <div style={{ opacity: 0.78, lineHeight: 1.45 }}>{detail}</div> : null}
            {startupOptionHint ? (
                <div style={{ opacity: 0.72, lineHeight: 1.45 }}>{startupOptionHint}</div>
            ) : null}
        </div>
    );
}

function ConnectionActionButtons({ panelState }: SincroControlPanelPageProps) {
    return (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
                type="button"
                onClick={panelState.startAction}
                disabled={!panelState.hasActiveController}
                style={panelStyles.button}
            >
                会話を開始
            </button>
            <button
                type="button"
                onClick={panelState.stopAction}
                disabled={!panelState.hasActiveController}
                style={panelStyles.button}
            >
                接続を停止
            </button>
        </div>
    );
}
