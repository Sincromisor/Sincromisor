import { Fragment, type ReactNode } from "react";
import {
    SettingsFieldStack,
    SettingsHint,
    SettingsRange,
    SettingsToggle,
    SettingsToggleGrid,
} from "../settingsPrimitives/settingsPrimitives";
import type { ToggleGroupProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

type CharacterDisplayTogglesProps = ToggleGroupProps & {
    uiHints: {
        enableCharacterReason?: string;
        enableCharacterGazeReason?: string;
        enableAutoMuteReason?: string;
    };
    renderHint?: (label: string, message: string) => ReactNode;
};

export function CharacterDisplayToggles({
    settings,
    uiState,
    uiHints,
    onApplySettings,
    gridDensity = "regular",
    toggleDensity = "regular",
    renderHint = (label, message) => (
        <SettingsHint>
            {label}: {message}
        </SettingsHint>
    ),
}: CharacterDisplayTogglesProps) {
    const hints = [
        { label: "3Dキャラクター表示", message: uiHints.enableCharacterReason },
        { label: "顔の向き", message: uiHints.enableCharacterGazeReason },
        { label: "自動ミュート", message: uiHints.enableAutoMuteReason },
    ].filter((hint): hint is { label: string; message: string } => !!hint.message);

    return (
        <>
            <CharacterDisplayToggleGrid
                settings={settings}
                uiState={uiState}
                onApplySettings={onApplySettings}
                gridDensity={gridDensity}
                toggleDensity={toggleDensity}
            />
            <CharacterMotionRangeControls settings={settings} onApplySettings={onApplySettings} />
            <CharacterDisplayHints hints={hints} renderHint={renderHint} />
        </>
    );
}

function CharacterDisplayToggleGrid({
    settings,
    uiState,
    onApplySettings,
    gridDensity,
    toggleDensity,
}: Pick<
    CharacterDisplayTogglesProps,
    "settings" | "uiState" | "onApplySettings" | "gridDensity" | "toggleDensity"
>) {
    return (
        <SettingsToggleGrid density={gridDensity}>
            <SettingsToggle
                density={toggleDensity}
                label="3Dキャラクターを表示"
                help={settingHelp.enableCharacter}
                checked={!!settings.enableCharacter}
                disabled={uiState.enableCharacterDisabled}
                onChange={(checked) => onApplySettings({ enableCharacter: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="顔の向きを使う"
                help={settingHelp.enableCharacterGaze}
                checked={!!settings.enableCharacterGaze}
                disabled={uiState.enableCharacterGazeDisabled}
                onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="sincroで姿勢を使う"
                help={settingHelp.enableSincroPoseTracking}
                checked={!!settings.enableSincroPoseTracking}
                disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                onChange={(checked) => onApplySettings({ enableSincroPoseTracking: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="姿勢を強制継続"
                help={settingHelp.forceSincroPoseTracking}
                checked={!!settings.forceSincroPoseTracking}
                disabled={
                    uiState.forceSincroPoseTrackingDisabled ||
                    !settings.enableCharacter ||
                    !settings.enableCharacterGaze ||
                    !settings.enableSincroPoseTracking
                }
                onChange={(checked) => onApplySettings({ forceSincroPoseTracking: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="自動でミュートする"
                help={settingHelp.enableAutoMute}
                checked={!!settings.enableAutoMute}
                disabled={uiState.enableAutoMuteDisabled}
                onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
            />
        </SettingsToggleGrid>
    );
}

function CharacterMotionRangeControls({
    settings,
    onApplySettings,
}: Pick<CharacterDisplayTogglesProps, "settings" | "onApplySettings">) {
    return (
        <SettingsFieldStack spacing="compact">
            <SettingsRange
                label="上半身モーション"
                help={settingHelp.characterMotionScale}
                min={0}
                max={1.2}
                step={0.05}
                value={settings.characterMotionScale}
                valueLabel={`${Math.round(settings.characterMotionScale * 100)}%`}
                disabled={!settings.enableCharacter}
                onChange={(value) => onApplySettings({ characterMotionScale: value })}
            />
            <SettingsRange
                label="姿勢同期"
                help={settingHelp.sincroPoseRetargetScale}
                min={0}
                max={1.2}
                step={0.05}
                value={settings.sincroPoseRetargetScale}
                valueLabel={`${Math.round(settings.sincroPoseRetargetScale * 100)}%`}
                disabled={
                    !settings.enableCharacter ||
                    !settings.enableCharacterGaze ||
                    !settings.enableSincroPoseTracking
                }
                onChange={(value) => onApplySettings({ sincroPoseRetargetScale: value })}
            />
            <SettingsRange
                label="目線追跡"
                help={settingHelp.characterEyeTrackingScale}
                min={0}
                max={1.2}
                step={0.05}
                value={settings.characterEyeTrackingScale}
                valueLabel={`${Math.round(settings.characterEyeTrackingScale * 100)}%`}
                disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                onChange={(value) => onApplySettings({ characterEyeTrackingScale: value })}
            />
        </SettingsFieldStack>
    );
}

function CharacterDisplayHints({
    hints,
    renderHint,
}: {
    hints: Array<{ label: string; message: string }>;
    renderHint: (label: string, message: string) => ReactNode;
}) {
    return hints.map((hint) => (
        <Fragment key={hint.label}>{renderHint(hint.label, hint.message)}</Fragment>
    ));
}
