import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

/** 対象項目が分かる名前で補足を開く。スクロール枠の外へ描画して長文を切らない。 */
export function SettingsHelpTooltip({ label, help, children }: HelpTooltipProps) {
    const tooltipId = useId();
    const containerRef = useRef<HTMLButtonElement | null>(null);
    const bubbleRef = useRef<HTMLSpanElement | null>(null);
    const [visible, setVisible] = useState(false);
    const position = useTooltipPosition(visible, containerRef, bubbleRef);
    useDismissTooltip(visible, containerRef, setVisible);
    if (!help) return <>{children}</>;
    // modal dialogの外へ出すとブラウザーに隠されるため、起動前はdialog直下へ置く。
    const portalRoot = visible ? (containerRef.current?.closest("dialog") ?? document.body) : null;
    return (
        <>
            <button
                ref={containerRef}
                type="button"
                className="settingsPrimitiveHelpBadge"
                aria-label={`${label}の説明を表示`}
                aria-describedby={visible ? tooltipId : undefined}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.stopPropagation();
                        setVisible(false);
                    }
                }}
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
            </button>
            {portalRoot &&
                createPortal(
                    <span
                        ref={bubbleRef}
                        id={tooltipId}
                        role="tooltip"
                        className="settingsPrimitiveHelpTooltip__bubble"
                        style={position}
                    >
                        {help}
                    </span>,
                    portalRoot,
                )}
        </>
    );
}

/** 画面内で左右を制限し、下に収まらない説明はボタンの上へ置く。 */
function useTooltipPosition(
    visible: boolean,
    anchorRef: RefObject<HTMLButtonElement | null>,
    bubbleRef: RefObject<HTMLSpanElement | null>,
) {
    const [position, setPosition] = useState({ left: 0, top: 0 });
    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        const bubble = bubbleRef.current;
        if (!visible || !anchor || !bubble) return;
        const update = () => {
            const rect = anchor.getBoundingClientRect();
            const { width, height } = bubble.getBoundingClientRect();
            setPosition({
                left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
                top: Math.max(
                    12,
                    rect.bottom + height + 8 > window.innerHeight
                        ? rect.top - height - 8
                        : rect.bottom + 8,
                ),
            });
        };
        update();
        // Tab移動による自動スクロールでも補足を閉じず、移動先の位置へ追従する。
        document.addEventListener("scroll", update, true);
        return () => document.removeEventListener("scroll", update, true);
    }, [visible, anchorRef, bubbleRef]);
    return position;
}

/** アンカー移動後に古い位置の説明を残さず、外側操作とリサイズで閉じる。 */
function useDismissTooltip(
    visible: boolean,
    containerRef: RefObject<HTMLButtonElement | null>,
    setVisible: (visible: boolean) => void,
): void {
    useEffect(() => {
        if (!visible) return;
        const dismiss = () => setVisible(false);
        const handlePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !containerRef.current?.contains(event.target))
                dismiss();
        };
        document.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("resize", dismiss);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("resize", dismiss);
        };
    }, [visible, containerRef, setVisible]);
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
