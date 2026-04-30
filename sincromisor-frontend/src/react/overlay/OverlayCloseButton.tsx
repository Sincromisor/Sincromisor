import type { ButtonHTMLAttributes } from "react";
import "./overlay.css";

type OverlayCloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
    ariaLabel: string;
};

// Overlay chrome 全体で使う閉じるボタン。
// 呼び出し側は既存 DOM id や追加 className を渡し、操作 API の互換性を維持する。
export function OverlayCloseButton({
    ariaLabel,
    className,
    children,
    ...buttonProps
}: OverlayCloseButtonProps) {
    const composedClassName = className
        ? `overlayCloseButton ${className}`
        : "overlayCloseButton";

    return (
        <button {...buttonProps} className={composedClassName} type="button" aria-label={ariaLabel}>
            {children ?? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M18.3 6.7a1 1 0 0 0-1.4 0L12 11.6 7.1 6.7a1 1 0 1 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4l-4.9-4.9 4.9-4.9a1 1 0 0 0 0-1.4z" />
                </svg>
            )}
        </button>
    );
}
