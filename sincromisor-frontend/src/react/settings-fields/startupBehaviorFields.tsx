import type { ReactNode } from "react";
import type {
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../app/appSettingsTypes";
import {
    SettingsFieldStack,
    SettingsHint,
    SettingsToggle,
    SettingsToggleGrid,
} from "../settings-primitives/SettingsPrimitives";
import type { ToggleGroupProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

type StartupBehaviorFieldsProps = ToggleGroupProps & {
    startupStatus: SincroAppStartupSettingsStatus;
    startupCapabilities: SincroAppStartupSettingsCapabilities;
    isRunning: boolean;
    introText?: {
        running: string;
        stopped: string;
    };
    renderHint?: (message: string, tone?: "muted" | "info" | "warning") => ReactNode;
    useFieldStack?: boolean;
    enableVrLabel?: string;
};

export function StartupBehaviorFields({
    settings,
    uiState,
    onApplySettings,
    startupStatus,
    startupCapabilities,
    isRunning,
    introText = {
        running:
            "開始前に決まる設定です。反映したい時は、いったん停止してからもう一度始めてください。",
        stopped: "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。",
    },
    renderHint = (message, tone) => <SettingsHint tone={tone}>{message}</SettingsHint>,
    useFieldStack = true,
    enableVrLabel = "VRで開く準備をする",
    gridDensity = "regular",
    toggleDensity = "regular",
}: StartupBehaviorFieldsProps) {
    const changedLabel =
        startupStatus.changedKeys.length > 0
            ? ` 変更: ${startupStatus.changedKeys.join(", ")}`
            : "";
    const items = [
        {
            key: "enableVR" as const,
            label: enableVrLabel,
            checked: !!settings.enableVR,
            disabled: uiState.enableVRDisabled,
            supported: startupCapabilities.enableVR,
            help: settingHelp.enableVR,
            onChange: (checked: boolean) => onApplySettings({ enableVR: checked }),
        },
    ].filter((item) => item.supported);

    if (items.length === 0) {
        return null;
    }

    const toggles = renderStartupToggles(items, gridDensity, toggleDensity);

    return (
        <>
            {renderHint(isRunning ? introText.running : introText.stopped)}
            {renderStartupStatusHint(startupStatus, changedLabel, renderHint)}
            {useFieldStack ? <SettingsFieldStack>{toggles}</SettingsFieldStack> : toggles}
        </>
    );
}

type StartupToggleItem = {
    key: "enableVR";
    label: string;
    checked: boolean;
    disabled: boolean;
    supported: boolean;
    help: string;
    onChange: (checked: boolean) => void;
};

function renderStartupToggles(
    items: StartupToggleItem[],
    gridDensity: ToggleGroupProps["gridDensity"],
    toggleDensity: ToggleGroupProps["toggleDensity"],
): ReactNode {
    return (
        <SettingsToggleGrid density={gridDensity}>
            {items.map((item) => (
                <SettingsToggle
                    key={item.key}
                    density={toggleDensity}
                    label={item.label}
                    help={item.help}
                    checked={item.checked}
                    disabled={item.disabled}
                    onChange={item.onChange}
                />
            ))}
        </SettingsToggleGrid>
    );
}

function renderStartupStatusHint(
    startupStatus: SincroAppStartupSettingsStatus,
    changedLabel: string,
    renderHint: (message: string, tone?: "muted" | "info" | "warning") => ReactNode,
): ReactNode {
    if (startupStatus.requiresRestart) {
        return renderHint(
            `変更した内容を反映するには、いったん停止してからもう一度始めてください。${changedLabel}`,
            "warning",
        );
    }
    if (startupStatus.willApplyOnNextStart) {
        return renderHint(`変更した内容は次に始める時に反映されます。${changedLabel}`, "info");
    }
    return null;
}
