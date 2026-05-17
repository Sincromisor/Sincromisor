import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { joinClassNames } from "./settingsClassNames";

type HelpTooltipProps = {
    help?: string;
    children: ReactNode;
};

type HelpBadgeProps = {
    help: string;
};

type SettingsHelpLabelProps = {
    text: string;
    help?: string;
};

export function SettingsHelpTooltip({ help, children }: HelpTooltipProps) {
    const containerRef = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState<boolean>(false);
    const [align, setAlign] = useState<"left" | "right">("left");

    useEffect(() => {
        if (!visible) {
            return;
        }
        const handlePointerDown = (event: PointerEvent) => {
            const root = containerRef.current;
            if (!root) {
                return;
            }
            if (event.target instanceof Node && !root.contains(event.target)) {
                setVisible(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [visible]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        const root = containerRef.current;
        if (!root) {
            return;
        }
        // 狭い dialog / side panel 内でも説明 bubble が viewport 外へ出にくい向きを選ぶ。
        const rect = root.getBoundingClientRect();
        setAlign(rect.left < window.innerWidth / 2 ? "left" : "right");
    }, [visible]);

    if (!help) {
        return <>{children}</>;
    }

    return (
        <button
            ref={containerRef}
            type="button"
            className="settingsPrimitiveHelpTooltip settingsPrimitiveHelpBadge"
            aria-label="設定説明を表示"
            aria-haspopup="true"
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setVisible((prev) => !prev);
            }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onFocus={() => setVisible(true)}
            onBlur={() => setVisible(false)}
        >
            {children}
            {visible ? (
                <span
                    role="tooltip"
                    className={joinClassNames(
                        "settingsPrimitiveHelpTooltip__bubble",
                        align === "right" && "settingsPrimitiveHelpTooltip__bubble--right",
                    )}
                >
                    {help}
                </span>
            ) : null}
        </button>
    );
}

export function SettingsHelpBadge({ help }: HelpBadgeProps) {
    return <SettingsHelpTooltip help={help}>?</SettingsHelpTooltip>;
}

export function SettingsHelpLabel({ text, help }: SettingsHelpLabelProps) {
    return (
        <div className="settingsPrimitiveHelpLabel">
            <span>{text}</span>
            {help ? <SettingsHelpBadge help={help} /> : null}
        </div>
    );
}
