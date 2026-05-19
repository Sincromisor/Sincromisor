import {
    SettingsStatusCard,
    SettingsSummaryGrid,
} from "../../../features/settings/react/shell/settingsShell";
import { BasicSettingsSection, LookingGlassSettingsSection } from "./components/settingsSections";
import { panelStyles } from "./panelStyles";
import type {
    SimpleVrmControlPanelPageProps,
    SimpleVrmPanelState,
} from "./simpleVrmControlPanelTypes";

export function LookingGlassControlPage({ panelState }: SimpleVrmControlPanelPageProps) {
    const { settings, settingsUiState } = panelState;

    return (
        <>
            <LookingGlassStatusSummary panelState={panelState} />
            <LookingGlassActionButtons panelState={panelState} />
            <BasicSettingsSection
                settings={settings}
                uiState={settingsUiState}
                onTitleChange={(titleText) => panelState.applySettings({ titleText })}
                onTalkModeChange={panelState.changeTalkMode}
                showTitle={false}
                showTalkMode={true}
                showSectionTitle={false}
            />
            <LookingGlassSettingsSection
                settings={settings}
                onApplySettings={panelState.applySettings}
                showSectionTitle={false}
            />
        </>
    );
}

function LookingGlassStatusSummary({ panelState }: SimpleVrmControlPanelPageProps) {
    const { lookingGlass, lookingGlassConfigStatus } = panelState;
    const lookingGlassStatusText = lookingGlass.code
        ? `${lookingGlass.state} [${lookingGlass.code}]`
        : lookingGlass.state;
    const applyLabel = lookingGlassConfigStatus.reloadRecommended
        ? "停止後に反映"
        : lookingGlassConfigStatus.pendingForNextSession
          ? "次回起動で反映"
          : "最新状態";
    const applyDetail = lookingGlassConfigStatus.reloadRecommended
        ? "停止してから Looking Glass をもう一度開始すると反映されます。"
        : lookingGlassConfigStatus.changedKeys.length > 0
          ? lookingGlassConfigStatus.changedKeys.join(", ")
          : undefined;

    return (
        <SettingsSummaryGrid>
            <SettingsStatusCard
                label="表示状態"
                value={lookingGlassStatusText}
                detail={lookingGlass.message}
                tone={getLookingGlassStatusTone(panelState)}
            />
            <SettingsStatusCard
                label="反映タイミング"
                value={applyLabel}
                detail={applyDetail}
                tone={lookingGlassConfigStatus.reloadRecommended ? "warn" : "neutral"}
            />
        </SettingsSummaryGrid>
    );
}

function getLookingGlassStatusTone(panelState: SimpleVrmPanelState): "neutral" | "good" | "warn" {
    if (panelState.lookingGlass.state === "active") {
        return "good";
    }
    return panelState.lookingGlass.state === "error" ? "warn" : "neutral";
}

function LookingGlassActionButtons({ panelState }: SimpleVrmControlPanelPageProps) {
    const canStart =
        panelState.lookingGlass.state !== "starting" && panelState.lookingGlass.state !== "active";
    const canStop =
        panelState.lookingGlass.state === "active" || panelState.lookingGlass.state === "starting";

    return (
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <button
                type="button"
                onClick={requestLookingGlassStart}
                disabled={!canStart}
                style={panelStyles.button}
            >
                Looking Glass 開始
            </button>
            <button
                type="button"
                onClick={requestLookingGlassStop}
                disabled={!canStop}
                style={panelStyles.button}
            >
                Looking Glass 停止
            </button>
        </div>
    );
}

function requestLookingGlassStart(): void {
    window.dispatchEvent(new CustomEvent("sincro:looking-glass-start-request"));
}

function requestLookingGlassStop(): void {
    window.dispatchEvent(new CustomEvent("sincro:looking-glass-stop-request"));
}
