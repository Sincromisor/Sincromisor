import { type PointerEvent, type ReactNode, useLayoutEffect, useRef } from "react";
import { useRightToolPanelState } from "../../../react/useRightToolPanelState";
import { OverlayCloseButton } from "./overlayCloseButton";
import "./overlay.css";

type RightToolFrameVariant = "settings" | "debug" | "history";

type RightToolFrameProps = {
    id: string;
    isOpen: boolean;
    title: string;
    ariaLabel?: string;
    onClose: () => void;
    variant: RightToolFrameVariant;
    children: ReactNode;
};

function closeButtonIdForVariant(variant: RightToolFrameVariant): string {
    return variant === "settings"
        ? "reactSettingsPanelClose"
        : variant === "debug"
          ? "debugConsoleClose"
          : "historyPanelClose";
}

// 右側ツール領域の fixed layer / surface / scroll / close chrome をまとめて所有する。
// 中身の SettingsShell や DebugConsole は、右側 overlay としての配置を知らないまま描画できる。
export function RightToolFrame({
    id,
    isOpen,
    title,
    ariaLabel,
    onClose,
    variant,
    children,
}: RightToolFrameProps) {
    const surfaceRef = useRef<HTMLElement>(null);
    const wasOpen = useRef(false);
    const { activePanel } = useRightToolPanelState();
    useLayoutEffect(() => {
        if (isOpen && !wasOpen.current)
            surfaceRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        // 別パネルへの切り替えでは、新しく開いたパネルのフォーカスを上書きしない。
        if (!isOpen && wasOpen.current && activePanel === "none")
            document.getElementById("debugMenuButton")?.focus();
        wasOpen.current = isOpen;
    }, [isOpen, activePanel]);
    const frameClassName = ["rightToolFrame", `rightToolFrame--${variant}`, isOpen ? "is-open" : ""]
        .filter(Boolean)
        .join(" ");

    const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            id={id}
            className={frameClassName}
            aria-hidden={!isOpen}
            inert={!isOpen}
            onPointerDown={handleBackdropPointerDown}
        >
            <section
                ref={surfaceRef}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        onClose();
                    }
                }}
                className="rightToolFrame__surface"
                role="dialog"
                aria-modal="false"
                aria-label={ariaLabel ?? title}
            >
                <div
                    id={variant === "settings" ? "sincroReactSettingsPanelChromeRoot" : undefined}
                    className="rightToolFrame__chrome"
                >
                    <OverlayCloseButton
                        id={closeButtonIdForVariant(variant)}
                        ariaLabel={`${title}を閉じる`}
                        onClick={onClose}
                    />
                </div>
                <div id={`${variant}ImportantNoticeRoot`} className="rightToolFrame__notice" />
                <div className="rightToolFrame__scroll">{children}</div>
            </section>
        </div>
    );
}
