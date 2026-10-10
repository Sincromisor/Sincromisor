import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import {
    SettingsStatusCard,
    SettingsSummaryGrid,
} from "../../../features/settings/react/shell/settingsShell";
import { LookingGlassSettingsSection } from "./components/lookingGlassSettingsSection";
import type { SincroControlPanelPageProps, SincroPanelState } from "./sincroControlPanelTypes";

/** Looking Glassの実行状態・開始停止・次回設定を専用カテゴリへまとめる。 */
export function LookingGlassControlPage({ panelState }: SincroControlPanelPageProps) {
    const { settings } = panelState;

    return (
        <>
            <LookingGlassStatusSummary panelState={panelState} />
            <LookingGlassActionButtons panelState={panelState} />
            <LookingGlassSettingsSection
                settings={settings}
                onApplySettings={panelState.applySettings}
                showSectionTitle={false}
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
    const lookingGlassStatusText = stateLabels[lookingGlass.state];
    const applyLabel = lookingGlassConfigStatus.reloadRecommended
        ? "停止・再開始が必要"
        : lookingGlassConfigStatus.pendingForNextSession
          ? "次回起動で反映"
          : "変更の反映待ちなし";
    const applyDetail = lookingGlassConfigStatus.reloadRecommended
        ? "停止してから Looking Glass をもう一度開始すると反映されます。"
        : lookingGlassConfigStatus.changedKeys.length > 0
          ? "変更した表示設定は、次回のLooking Glass開始時に反映されます。"
          : undefined;

    return (
        <SettingsSummaryGrid>
            <SettingsStatusCard
                label="表示状態"
                value={lookingGlassStatusText}
                detail={[lookingGlass.message, lookingGlass.code].filter(Boolean).join(" / ")}
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

function getLookingGlassStatusTone(panelState: SincroPanelState): "neutral" | "good" | "warn" {
    if (panelState.lookingGlass.state === "active") {
        return "good";
    }
    return panelState.lookingGlass.state === "error" ? "warn" : "neutral";
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
