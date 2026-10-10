import type { ReactNode } from "react";
import { useId } from "react";
import { joinClassNames } from "./settingsClassNames";
import { SettingsHelpBadge } from "./settingsHelp";

type SettingsToggleProps = {
    label: string;
    help?: string;
    description?: string;
    disabledReason?: string;
    checked: boolean;
    disabled?: boolean;
    density?: "compact" | "regular";
    onChange: (checked: boolean) => void;
};

type SettingsToggleGridProps = {
    children: ReactNode;
    density?: "compact" | "regular";
};

/** 設定のまとまりを幅に応じて配置する。 */
export function SettingsToggleGrid({ children, density = "regular" }: SettingsToggleGridProps) {
    return (
        <div
            className={joinClassNames(
                "settingsPrimitiveToggleGrid",
                density === "compact" && "settingsPrimitiveToggleGrid--compact",
            )}
        >
            {children}
        </div>
    );
}

/** 設定の有効状態と操作可否を表示し、項目別の説明を添える。 */
export function SettingsToggle({
    label,
    help,
    description,
    disabledReason,
    checked,
    disabled = false,
    density = "regular",
    onChange,
}: SettingsToggleProps) {
    const descriptionId = useId();
    const labelId = useId();
    return (
        <label
            className={joinClassNames(
                "settingsPrimitiveToggle",
                density === "compact" && "settingsPrimitiveToggle--compact",
                disabled && "is-disabled",
            )}
        >
            <input
                type="checkbox"
                aria-labelledby={labelId}
                checked={checked}
                disabled={disabled}
                aria-describedby={description || disabled ? descriptionId : undefined}
                className="settingsPrimitiveToggle__input"
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className="settingsPrimitiveToggle__content">
                <span className="settingsPrimitiveToggle__label">
                    <span id={labelId}>{label}</span>
                    {help ? <SettingsHelpBadge label={label} help={help} /> : null}
                </span>
                {(description || disabled) && (
                    <span id={descriptionId} className="settingsPrimitiveFieldDescription">
                        {description}
                        {disabled && (
                            <span className="settingsPrimitiveDisabledReason">
                                {disabledReason ?? "現在の構成では変更できません。"}
                            </span>
                        )}
                    </span>
                )}
            </span>
        </label>
    );
}
