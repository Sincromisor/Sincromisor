import type { ReactNode } from "react";
import { joinClassNames } from "./settingsClassNames";
import { SettingsHelpBadge } from "./settingsHelp";

type SettingsToggleProps = {
    label: string;
    help?: string;
    checked: boolean;
    disabled?: boolean;
    density?: "compact" | "regular";
    onChange: (checked: boolean) => void;
};

type SettingsToggleGridProps = {
    children: ReactNode;
    density?: "compact" | "regular";
};

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

export function SettingsToggle({
    label,
    help,
    checked,
    disabled = false,
    density = "regular",
    onChange,
}: SettingsToggleProps) {
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
                checked={checked}
                disabled={disabled}
                className="settingsPrimitiveToggle__input"
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className="settingsPrimitiveToggle__label">
                {label}
                {help ? <SettingsHelpBadge help={help} /> : null}
            </span>
        </label>
    );
}
