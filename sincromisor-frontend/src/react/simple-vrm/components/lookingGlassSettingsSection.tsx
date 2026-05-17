import { settingHelp } from "../../settings-fields/SettingsFields";
import { SettingsButton, SettingsHelpLabel } from "../../settings-primitives/SettingsPrimitives";
import type { ApplySettingsFn, SincroAppSettingsSnapshot } from "../panelTypes";
import { NumericSettingField } from "./numericSettingField";
import { compactGapPx, rowGapPx, sectionSpacingPx, settingsTuning } from "./settingsSectionLayout";

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
        // 既定値は展示実機で焦点を合わせやすかった Focus 値を採用する。
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
        // 展示構図（全身を収めやすい引き気味・下寄り）も合わせて既定値に寄せる。
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
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showSectionTitle ? (
                <SettingsHelpLabel text="Looking Glass 設定" />
            ) : (
                <div
                    style={{
                        opacity: 0.8,
                        fontWeight: 700,
                        marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                    }}
                >
                    Looking Glass 表示
                </div>
            )}
            <div style={{ opacity: 0.6, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                これらの値は、次回の Looking Glass 起動時に適用されます。
            </div>
            <div style={{ opacity: 0.7, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                ピンボケ気味の場合は、まず <code>Target Z</code> と <code>Target Diam</code>{" "}
                を少しずつ調整してください。
            </div>
            {/* プリセットは初期位置合わせの近道。最終的な値は下の数値入力で追い込む。 */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: `${compactGapPx}px`,
                    marginBottom: `${rowGapPx}px`,
                }}
            >
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
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: `${compactGapPx}px`,
                }}
            >
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
            </div>
        </div>
    );
}
