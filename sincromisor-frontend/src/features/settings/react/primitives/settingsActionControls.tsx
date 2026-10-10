import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./settingsClassNames";

type SettingsButtonProps = {
    children: ReactNode;
    tone?: "normal" | "primary" | "danger";
    className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** 操作の重要度だけを外観に反映し、実行条件と処理は呼び出し元が持つ。 */
export function SettingsButton({
    children,
    className,
    tone = "normal",
    ...props
}: SettingsButtonProps) {
    return (
        <button
            {...props}
            className={joinClassNames(
                "settingsPrimitiveButton",
                `settingsPrimitiveButton--${tone}`,
                className,
            )}
        >
            {children}
        </button>
    );
}
