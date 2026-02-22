import type { CSSProperties } from "react";
import { UI_TUNING } from "../app/uiTuning";

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
        border: "1px solid rgba(255,255,255,0.25)",
        background: "rgba(17, 22, 31, 0.82)",
        color: "#f4f7fb",
        boxShadow: "0 8px 28px rgba(0,0,0,0.24)",
        backdropFilter: "blur(8px)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        overflowX: "hidden",
        overflowY: "auto",
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
        border: "1px solid rgba(255,255,255,0.2)",
        background: "rgba(255,255,255,0.08)",
        color: "#f4f7fb",
        cursor: "pointer",
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
