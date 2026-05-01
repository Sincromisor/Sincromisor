import type { PointerEvent, ReactNode } from "react";
import { OverlayCloseButton } from "./OverlayCloseButton";
import "./overlay.css";

type RightToolFrameVariant = "settings" | "debug";

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
    return variant === "settings" ? "reactSettingsPanelClose" : "debugConsoleClose";
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
    const frameClassName = [
        "rightToolFrame",
        `rightToolFrame--${variant}`,
        isOpen ? "is-open" : "",
    ].filter(Boolean).join(" ");

    const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    const handleClosePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
        // 右側 tool frame 内では pointerup/click が外側 shell に retarget されることがある。
        // pointer 操作は押下時点で閉じ、keyboard 操作は onClick に任せる。
        if (event.button === 0) {
            event.stopPropagation();
            onClose();
        }
    };

    return (
        <div id={id} className={frameClassName} aria-hidden={!isOpen} onPointerDown={handleBackdropPointerDown}>
            <section className="rightToolFrame__surface" role="dialog" aria-modal="false" aria-label={ariaLabel ?? title}>
                <div id={variant === "settings" ? "sincroReactSettingsPanelChromeRoot" : undefined} className="rightToolFrame__chrome">
                    <OverlayCloseButton
                        id={closeButtonIdForVariant(variant)}
                        ariaLabel={`${title}を閉じる`}
                        onPointerDown={handleClosePointerDown}
                        onClick={onClose}
                    />
                </div>
                <div className="rightToolFrame__scroll">
                    {children}
                </div>
            </section>
        </div>
    );
}
