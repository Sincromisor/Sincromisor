import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./settingsClassNames";

type SettingsButtonProps = {
    children: ReactNode;
    className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function SettingsButton({ children, className, ...props }: SettingsButtonProps) {
    return (
        <button {...props} className={joinClassNames("settingsPrimitiveButton", className)}>
            {children}
        </button>
    );
}
