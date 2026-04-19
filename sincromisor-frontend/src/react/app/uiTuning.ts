// React UI の表示件数・タイミングなど、見た目寄りの調整値を集約する。
// 複数 component/hook で同じ数字を使う場合はここへ寄せる。

export const UI_TUNING = {
    controlPanel: {
        chatLogLimit: 5,
        telopLogLimit: 5,
        rtcEventLogLimit: 4,
        sectionSpacingPx: 10,
        detailsContentTopMarginPx: 8,
        styles: {
            rootBorderRadiusPx: 12,
            rootPaddingPx: 14,
            rootFontSizePx: 13,
            rootMaxHeightOffsetPx: 110,
            controlsGapPx: 8,
            buttonBorderRadiusPx: 8,
            buttonPaddingYpx: 9,
            buttonPaddingXpx: 12,
            miniCardBorderRadiusPx: 6,
            miniCardPaddingYpx: 6,
            miniCardPaddingXpx: 8,
            miniLogBorderRadiusPx: 6,
            miniLogPaddingYpx: 6,
            miniLogPaddingXpx: 8,
            diagnosticsCardGapPx: 8,
            diagnosticsSectionTitleMarginBottomPx: 4,
        },
        settings: {
            compactGapPx: 6,
            rowGapPx: 8,
            helpLabelMarginBottomPx: 4,
            hintMarginTopPx: 4,
            tooltipOffsetPx: 6,
            helpBadgeSizePx: 18,
            helpBadgeMarginLeftPx: 6,
            tooltipFontSizePx: 11,
        },
        diagnostics: {
            sectionGapPx: 4,
            sectionSpacingPx: 10,
            statusGridColumns: 2,
            messageLogMaxHeightPx: 120,
        },
    },
    dialogPop: {
        renderLimit: 3,
        showDelayMs: 10,
        hideTransitionMs: 500,
        cleanupMarginMs: 500,
    },
} as const;
