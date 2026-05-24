import type { ReactNode } from "react";
import { settingsPageCopy } from "../shell/settingsPageCopy";
import type { SettingsShellPage } from "../shell/settingsShell";

export type CoreSettingsPageId = "conversation" | "devices" | "audio" | "display" | "connection";

export type CoreSettingsPageContent = Partial<Record<CoreSettingsPageId, ReactNode>>;

type CoreSettingsPageDefinition = Omit<SettingsShellPage, "content">;

const CORE_SETTINGS_PAGE_ORDER: CoreSettingsPageId[] = [
    "conversation",
    "devices",
    "audio",
    "display",
    "connection",
];

const CORE_SETTINGS_PAGE_DEFINITIONS: Record<CoreSettingsPageId, CoreSettingsPageDefinition> = {
    conversation: {
        id: "conversation",
        label: settingsPageCopy.conversation.label,
        title: settingsPageCopy.conversation.title,
    },
    devices: {
        id: "devices",
        label: settingsPageCopy.devices.label,
        title: settingsPageCopy.devices.title,
    },
    audio: {
        id: "audio",
        label: settingsPageCopy.audio.label,
        title: settingsPageCopy.audio.title,
        description: settingsPageCopy.audio.description,
    },
    display: {
        id: "display",
        label: settingsPageCopy.display.label,
        title: settingsPageCopy.display.title,
    },
    connection: {
        id: "connection",
        label: settingsPageCopy.connection.label,
        title: settingsPageCopy.connection.title,
        description: settingsPageCopy.connection.description,
    },
};

export function createCoreSettingsPages(content: CoreSettingsPageContent): SettingsShellPage[] {
    return CORE_SETTINGS_PAGE_ORDER.flatMap((pageId) => {
        const pageContent = content[pageId];
        return pageContent === undefined ? [] : [createCoreSettingsPage(pageId, pageContent)];
    });
}

export function createCoreSettingsPage(
    pageId: CoreSettingsPageId,
    content: ReactNode,
): SettingsShellPage {
    return {
        ...CORE_SETTINGS_PAGE_DEFINITIONS[pageId],
        content,
    };
}
