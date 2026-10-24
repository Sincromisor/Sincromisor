import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import { LookingGlassSettingsSection } from "./components/lookingGlassSettingsSection";
import type { SincroControlPanelPageProps } from "./sincroControlPanelTypes";

/** Looking Glassの実行状態・開始停止・次回設定を専用カテゴリへまとめる。 */
export function LookingGlassControlPage({ panelState }: SincroControlPanelPageProps) {
    const { settings } = panelState;

    return (
        <>
            <div className="settingsPrimitiveFieldStack">
                <LookingGlassStatusSummary panelState={panelState} />
                <LookingGlassActionButtons panelState={panelState} />
            </div>
            <LookingGlassSettingsSection
                settings={settings}
                onApplySettings={panelState.applySettings}
            />
        </>
    );
}

/** 適用待ちは既存追跡状態だけから表示し、設定保存を描画への適用と混同しない。 */
function LookingGlassStatusSummary({ panelState }: SincroControlPanelPageProps) {
    const { lookingGlass, lookingGlassConfigStatus } = panelState;
    const stateLabels = {
        idle: "停止中",
        starting: "開始中",
        recovering: "復旧中",
        active: "表示中",
        error: "開始・表示に失敗",
    };
    const applyHint = lookingGlassConfigStatus.reloadRecommended
        ? "変更を反映するには、停止して再開始してください。"
        : lookingGlassConfigStatus.pendingForNextSession
          ? "変更は次回開始時に反映します。"
          : undefined;

    return (
        <div className="settingsPrimitiveConnectionStatus" role="status">
            <strong>{stateLabels[lookingGlass.state]}</strong>
            {lookingGlass.message || lookingGlass.code ? (
                <div>{[lookingGlass.message, lookingGlass.code].filter(Boolean).join(" / ")}</div>
            ) : null}
            {applyHint ? <div>{applyHint}</div> : null}
        </div>
    );
}

function LookingGlassActionButtons({ panelState }: SincroControlPanelPageProps) {
    const canStart =
        panelState.lookingGlass.state !== "starting" && panelState.lookingGlass.state !== "active";
    const canStop =
        panelState.lookingGlass.state === "active" || panelState.lookingGlass.state === "starting";

    return (
        <div className="settingsPrimitiveButtonRow">
            <SettingsButton
                type="button"
                tone="primary"
                onClick={requestLookingGlassStart}
                disabled={!canStart}
            >
                Looking Glass 開始
            </SettingsButton>
            <SettingsButton type="button" onClick={requestLookingGlassStop} disabled={!canStop}>
                Looking Glass 停止
            </SettingsButton>
        </div>
    );
}

function requestLookingGlassStart(): void {
    window.dispatchEvent(new CustomEvent("sincro:looking-glass-start-request"));
}

function requestLookingGlassStop(): void {
    window.dispatchEvent(new CustomEvent("sincro:looking-glass-stop-request"));
}
