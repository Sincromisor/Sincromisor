import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { joinClassNames } from "./settingsClassNames";

type HelpTooltipProps = {
    label: string;
    help?: string;
    children: ReactNode;
};

type HelpBadgeProps = {
    label: string;
    help: string;
};

type SettingsHelpLabelProps = {
    htmlFor?: string;
    text: string;
    help?: string;
};

/** 対象項目が分かる名前で説明を開き、外側操作やフォーカス離脱で閉じる。 */
export function SettingsHelpTooltip({ label, help, children }: HelpTooltipProps) {
    const containerRef = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState<boolean>(false);
    const [align, setAlign] = useState<"left" | "right">("left");

    useDismissTooltipOnOutsidePointer(visible, containerRef, setVisible);
    useTooltipViewportAlignment(visible, containerRef, setAlign);

    if (!help) {
        return <>{children}</>;
    }

    return (
        <button
            ref={containerRef}
            type="button"
            className="settingsPrimitiveHelpTooltip settingsPrimitiveHelpBadge"
            aria-label={`${label}の説明を表示`}
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

function useDismissTooltipOnOutsidePointer(
    visible: boolean,
    containerRef: RefObject<HTMLButtonElement | null>,
    setVisible: (visible: boolean) => void,
): void {
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
    }, [visible, containerRef, setVisible]);
}

function useTooltipViewportAlignment(
    visible: boolean,
    containerRef: RefObject<HTMLButtonElement | null>,
    setAlign: (align: "left" | "right") => void,
): void {
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
    }, [visible, containerRef, setAlign]);
}

/** 項目名を保持する共通の説明ボタン。 */
export function SettingsHelpBadge({ label, help }: HelpBadgeProps) {
    return (
        <SettingsHelpTooltip label={label} help={help}>
            ?
        </SettingsHelpTooltip>
    );
}

/** 見えるラベルと入力を結び、説明ボタンはラベルの外へ置く。 */
export function SettingsHelpLabel({ text, help, htmlFor }: SettingsHelpLabelProps) {
    return (
        <div className="settingsPrimitiveHelpLabel">
            {htmlFor ? <label htmlFor={htmlFor}>{text}</label> : <span>{text}</span>}
            {help ? <SettingsHelpBadge label={text} help={help} /> : null}
        </div>
    );
}
