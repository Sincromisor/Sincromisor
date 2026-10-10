import type { CSSProperties } from "react";
import { UI_TUNING } from "../../react/uiTuning";

type PanelStyles = {
    root: CSSProperties;
    button: CSSProperties;
    miniCard: CSSProperties;
};

/** 共通設定パネルの枠・操作・診断カードの表示を揃える。 */
export const panelStyles: PanelStyles = {
    root: {
        ...(() => {
            const tuning = UI_TUNING.controlPanel.styles;
            return {
                borderRadius: `${tuning.rootBorderRadiusPx}px`,
                padding: `${tuning.rootPaddingPx}px`,
                fontSize: `${tuning.rootFontSizePx}px`,
            };
        })(),
        // Debug Menu から開く専用コンテナ内に描画するため、fixed ではなく relative で組む。
        position: "relative",
        width: "100%",
        border: "1px solid var(--sincro-color-border-strong)",
        background: "var(--sincro-surface-overlay-frame)",
        color: "var(--sincro-color-overlay-text-primary)",
        fontFamily: "var(--sincro-font-family-base)",
        display: "grid",
        gridTemplateRows: "minmax(0, 1fr)",
        minHeight: 0,
        overflow: "hidden",
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
        background: "var(--sincro-color-surface-soft-strong)",
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
};
