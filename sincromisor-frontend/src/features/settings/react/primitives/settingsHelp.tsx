import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";

type HelpTooltipProps = { label: string; help?: string; children: ReactNode };
type HelpBadgeProps = { label: string; help: string };
type SettingsHelpLabelProps = { htmlFor?: string; text: string; help?: string };

// ボタンから本文へ斜めに移動する間の猶予。ネイティブ側のinterest-delay-endと揃える。
const HOVER_EXIT_DELAY_MS = 600;

/** 説明をトップレイヤーに置き、起動前モーダル内でもスクロール枠で切らない。 */
export function SettingsHelpTooltip({ label, help, children }: HelpTooltipProps) {
    const tooltipId = useId();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const bubbleRef = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const nativeInterest =
        typeof HTMLButtonElement !== "undefined" &&
        "interestForElement" in HTMLButtonElement.prototype;
    useFallbackInterest(nativeInterest, buttonRef, bubbleRef);
    useEffect(() => {
        // モーダルのEscape抑止より先に説明を閉じ、親の設定パネルへ伝播させない。
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !bubbleRef.current?.matches(":popover-open")) return;
            // 自分で閉じた後に標準Escapeが下のautoメニューも閉じるのを防ぐ。
            event.preventDefault();
            bubbleRef.current?.hidePopover();
            event.stopPropagation();
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, []);
    if (!help) return <>{children}</>;
    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="settingsPrimitiveHelpBadge"
                aria-label={`${label}の説明を表示`}
                aria-expanded={visible}
                aria-controls={tooltipId}
                popoverTarget={tooltipId}
                popoverTargetAction="show"
                {...(nativeInterest ? { interestfor: tooltipId } : {})}
            >
                {children}
            </button>
            <span
                ref={bubbleRef}
                id={tooltipId}
                role="tooltip"
                popover="hint"
                className="settingsPrimitiveHelpTooltip__bubble"
                onToggle={(event) => setVisible(event.newState === "open")}
            >
                {help}
            </span>
        </>
    );
}

/** Interest Invokers非対応時だけホバー・フォーカスを補う。配置と閉じる操作はPopoverに任せる。 */
function useFallbackInterest(
    nativeInterest: boolean,
    buttonRef: RefObject<HTMLButtonElement | null>,
    bubbleRef: RefObject<HTMLSpanElement | null>,
): void {
    useEffect(() => {
        const button = buttonRef.current;
        const bubble = bubbleRef.current;
        if (nativeInterest || !button || !bubble) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const keep = () => clearTimeout(timer);
        const show = () => {
            keep();
            bubble.showPopover({ source: button });
        };
        const leave = () => {
            keep();
            timer = setTimeout(() => {
                if (!button.matches(":hover, :focus") && !bubble.matches(":hover")) {
                    bubble.hidePopover();
                }
            }, HOVER_EXIT_DELAY_MS);
        };
        button.addEventListener("mouseenter", show);
        button.addEventListener("focus", show);
        button.addEventListener("mouseleave", leave);
        button.addEventListener("blur", leave);
        bubble.addEventListener("mouseenter", keep);
        bubble.addEventListener("mouseleave", leave);
        return () => {
            keep();
            button.removeEventListener("mouseenter", show);
            button.removeEventListener("focus", show);
            button.removeEventListener("mouseleave", leave);
            button.removeEventListener("blur", leave);
            bubble.removeEventListener("mouseenter", keep);
            bubble.removeEventListener("mouseleave", leave);
        };
    }, [nativeInterest, buttonRef, bubbleRef]);
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
