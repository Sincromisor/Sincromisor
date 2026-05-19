import type { CSSProperties } from "react";
import { UI_TUNING } from "../../../app/react/uiTuning";

type PanelStyles = {
    root: CSSProperties;
    button: CSSProperties;
    miniCard: CSSProperties;
    miniLog: CSSProperties;
};

export const panelStyles: PanelStyles = {
    root: {
        ...(() => {
            const tuning = UI_TUNING.controlPanel.styles;
            return {
                borderRadius: `${tuning.rootBorderRadiusPx}px`,
                padding: `${tuning.rootPaddingPx}px`,
                fontSize: `${tuning.rootFontSizePx}px`,
                maxHeight: `calc(100dvh - ${tuning.rootMaxHeightOffsetPx}px)`,
            };
        })(),
        // Debug Menu から開く専用コンテナ内に描画するため、fixed ではなく relative で組む。
        position: "relative",
        width: "100%",
        border: "1px solid var(--sincro-color-overlay-panel-border, hsl(186deg 65% 52% / 30%))",
        background:
            "var(--sincro-surface-overlay-frame, linear-gradient(145deg, rgba(18, 24, 33, 0.94), rgba(11, 15, 22, 0.94)))",
        color: "#f4f7fb",
        boxShadow: "0 14px 44px rgba(0, 0, 0, 0.34)",
        backdropFilter: "blur(8px)",
        fontFamily: '"IBM Plex Sans", "BIZ UDPGothic", "UDPGothic", sans-serif',
        overflowX: "hidden",
        overflowY: "auto",
        scrollbarGutter: "stable",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(130, 188, 255, 0.65) rgba(255,255,255,0.08)",
    },
    button: {
        ...(() => {
            const tuning = UI_TUNING.controlPanel.styles;
            return {
                borderRadius: `${tuning.buttonBorderRadiusPx}px`,
                padding: `${tuning.buttonPaddingYpx}px ${tuning.buttonPaddingXpx}px`,
            };
        })(),
        flex: 1,
        border: "1px solid hsl(190deg 60% 60% / 30%)",
        background: "linear-gradient(180deg, rgba(43, 77, 102, 0.68), rgba(24, 45, 61, 0.78))",
        color: "#f4f7fb",
        cursor: "pointer",
        fontWeight: 600,
    },
    miniCard: {
        ...(() => {
            const tuning = UI_TUNING.controlPanel.styles;
            return {
                borderRadius: `${tuning.miniCardBorderRadiusPx}px`,
                padding: `${tuning.miniCardPaddingYpx}px ${tuning.miniCardPaddingXpx}px`,
            };
        })(),
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
    },
    miniLog: {
        ...(() => {
            const tuning = UI_TUNING.controlPanel.styles;
            return {
                borderRadius: `${tuning.miniLogBorderRadiusPx}px`,
                padding: `${tuning.miniLogPaddingYpx}px ${tuning.miniLogPaddingXpx}px`,
            };
        })(),
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
    },
};
