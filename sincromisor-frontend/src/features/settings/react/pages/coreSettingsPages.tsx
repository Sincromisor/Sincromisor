import type { ReactNode } from "react";
import { settingsPageCopy } from "../shell/settingsPageCopy";
import type { SettingsShellPage } from "../shell/settingsShell";

/** 通常設定の分類。画面の選択状態だけに使い、保存形式には含めない。 */
export type CoreSettingsPageId = "experience" | "character" | "audio" | "camera" | "screen";
/** 起動前後で同じ順序に並べる本文。未提供の分類は表示しない。 */
export type CoreSettingsPageContent = Partial<Record<CoreSettingsPageId, ReactNode>>;

const CORE_SETTINGS_PAGE_ORDER: CoreSettingsPageId[] = [
    "experience",
    "character",
    "audio",
    "camera",
    "screen",
];

/** 画面固有の操作を含む本文を、共通の名称・順序へ組み立てる。 */
export function createCoreSettingsPages(content: CoreSettingsPageContent): SettingsShellPage[] {
    return CORE_SETTINGS_PAGE_ORDER.flatMap((pageId) => {
        const pageContent = content[pageId];
        return pageContent === undefined
            ? []
            : [{ id: pageId, ...settingsPageCopy[pageId], content: pageContent }];
    });
}
