import { defaultSincroAppSettingsSnapshot } from "../../../../app/settings/sincroAppSettingsDefaults";
import { settingHelp } from "../../../../features/settings/react/fields/settingsFields";
import {
    SettingsButton,
    SettingsHelpLabel,
    SettingsHint,
} from "../../../../features/settings/react/primitives/settingsPrimitives";
import type { ApplySettingsFn, SincroAppSettingsSnapshot } from "../panelTypes";
import { NumericSettingField } from "./numericSettingField";

type LookingGlassSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    onApplySettings: ApplySettingsFn;
    showSectionTitle?: boolean;
};

const LOOKING_GLASS_PRESETS: Array<{
    label: string;
    values: Partial<SincroAppSettingsSnapshot>;
}> = [
    {
        label: "標準 (Default)",
        // アプリ全体の Looking Glass 既定値と同じ値へ戻すための preset。
        values: {
            lgTileHeight: defaultSincroAppSettingsSnapshot.lgTileHeight,
            lgNumViews: defaultSincroAppSettingsSnapshot.lgNumViews,
            lgTargetY: defaultSincroAppSettingsSnapshot.lgTargetY,
            lgTargetZ: defaultSincroAppSettingsSnapshot.lgTargetZ,
            lgTargetDiam: defaultSincroAppSettingsSnapshot.lgTargetDiam,
            lgDepthiness: defaultSincroAppSettingsSnapshot.lgDepthiness,
            lgFovyDeg: defaultSincroAppSettingsSnapshot.lgFovyDeg,
        },
    },
    {
        label: "縦長 (Portrait)",
        values: {
            lgTileHeight: 640,
            lgNumViews: 45,
            lgTargetY: 1.35,
            lgTargetZ: 0.45,
            lgTargetDiam: 0.8,
            lgDepthiness: 0.9,
            lgFovyDeg: 22,
        },
    },
    {
        label: "広角 (Wide)",
        values: {
            lgTileHeight: 512,
            lgNumViews: 48,
            lgTargetY: 1.15,
            lgTargetZ: 0.6,
            lgTargetDiam: 0.95,
            lgDepthiness: 1.2,
            lgFovyDeg: 30,
        },
    },
    {
        label: "焦点調整用 (Focus)",
        values: {
            lgTileHeight: 512,
            lgNumViews: 45,
            lgTargetY: 0.95,
            lgTargetZ: 0.05,
            lgTargetDiam: 1.25,
            lgDepthiness: 0.85,
            lgFovyDeg: 24,
        },
    },
];

export function LookingGlassSettingsSection({
    settings,
    onApplySettings,
    showSectionTitle = true,
}: LookingGlassSettingsSectionProps) {
    return (
        <div className="settingsPrimitiveSectionBlock">
            <LookingGlassSectionHeader showSectionTitle={showSectionTitle} />
            <LookingGlassPresetButtons onApplySettings={onApplySettings} />
            <LookingGlassNumericSettingsGrid
                settings={settings}
                onApplySettings={onApplySettings}
            />
        </div>
    );
}

function LookingGlassSectionHeader({ showSectionTitle }: { showSectionTitle: boolean }) {
    return (
        <>
            {showSectionTitle ? (
                <SettingsHelpLabel text="Looking Glass 設定" />
            ) : (
                <div className="settingsPrimitiveSectionLead">Looking Glass 表示</div>
            )}
            <SettingsHint className="settingsPrimitiveHint--bottomGap settingsPrimitiveHint--soft">
                これらの値は、次回の Looking Glass 起動時に適用されます。
            </SettingsHint>
            <SettingsHint className="settingsPrimitiveHint--bottomGap">
                ピンボケ気味の場合は、まず <code>Target Z</code> と <code>Target Diam</code>{" "}
                を少しずつ調整してください。
            </SettingsHint>
        </>
    );
}

function LookingGlassPresetButtons({
    onApplySettings,
}: Pick<LookingGlassSettingsSectionProps, "onApplySettings">) {
    return (
        <div className="settingsPrimitiveButtonRow">
            {LOOKING_GLASS_PRESETS.map((preset) => (
                <SettingsButton
                    key={preset.label}
                    type="button"
                    onClick={() => onApplySettings(preset.values)}
                >
                    {preset.label}
                </SettingsButton>
            ))}
        </div>
    );
}

function LookingGlassNumericSettingsGrid({
    settings,
    onApplySettings,
}: Pick<LookingGlassSettingsSectionProps, "settings" | "onApplySettings">) {
    return (
        <div className="settingsPrimitiveTwoColumnGrid">
            <LookingGlassDisplaySettingsFields
                settings={settings}
                onApplySettings={onApplySettings}
            />
            <LookingGlassTargetSettingsFields
                settings={settings}
                onApplySettings={onApplySettings}
            />
        </div>
    );
}

function LookingGlassDisplaySettingsFields({
    settings,
    onApplySettings,
}: Pick<LookingGlassSettingsSectionProps, "settings" | "onApplySettings">) {
    return (
        <>
            <NumericSettingField
                label="タイル高さ (Tile Height)"
                help={settingHelp.lgTileHeight}
                value={settings.lgTileHeight}
                min={256}
                max={2048}
                step={1}
                onChange={(value) => onApplySettings({ lgTileHeight: value })}
            />
            <NumericSettingField
                label="視差ビュー数 (Views)"
                help={settingHelp.lgNumViews}
                value={settings.lgNumViews}
                min={8}
                max={64}
                step={1}
                onChange={(value) => onApplySettings({ lgNumViews: value })}
            />
            <NumericSettingField
                label="奥行き強調 (Depthiness)"
                help={settingHelp.lgDepthiness}
                value={settings.lgDepthiness}
                min={0}
                max={4}
                step={0.05}
                onChange={(value) => onApplySettings({ lgDepthiness: value })}
            />
            <NumericSettingField
                label="縦FOV (FOV Y, deg)"
                help={settingHelp.lgFovyDeg}
                value={settings.lgFovyDeg}
                min={5}
                max={80}
                step={0.5}
                onChange={(value) => onApplySettings({ lgFovyDeg: value })}
            />
        </>
    );
}

function LookingGlassTargetSettingsFields({
    settings,
    onApplySettings,
}: Pick<LookingGlassSettingsSectionProps, "settings" | "onApplySettings">) {
    return (
        <>
            <NumericSettingField
                label="注視高さ (Target Y)"
                help={settingHelp.lgTargetY}
                value={settings.lgTargetY}
                min={-2}
                max={4}
                step={0.05}
                onChange={(value) => onApplySettings({ lgTargetY: value })}
            />
            <NumericSettingField
                label="注視奥行き (Target Z)"
                help={settingHelp.lgTargetZ}
                value={settings.lgTargetZ}
                min={-1}
                max={2}
                step={0.05}
                onChange={(value) => onApplySettings({ lgTargetZ: value })}
            />
            <NumericSettingField
                label="注視範囲 (Target Diam)"
                help={settingHelp.lgTargetDiam}
                value={settings.lgTargetDiam}
                min={0.1}
                max={3}
                step={0.05}
                onChange={(value) => onApplySettings({ lgTargetDiam: value })}
            />
        </>
    );
}
