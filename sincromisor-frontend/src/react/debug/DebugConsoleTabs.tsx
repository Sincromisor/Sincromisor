import { IntegratedTabs } from "../integrated-tabs/IntegratedTabs";
import type { DebugTabKey } from "./debugConsoleTypes";

const DEBUG_TABS: { id: DebugTabKey; label: string }[] = [
    { id: "status", label: "Status" },
    { id: "audio", label: "Audio" },
    { id: "messages", label: "Messages" },
    { id: "gaze", label: "Gaze" },
    { id: "sincro", label: "Sincro" },
    { id: "rtc", label: "RTC" },
    { id: "sdp", label: "SDP" },
];

type DebugConsoleTabsProps = {
    activeTab: DebugTabKey;
    onSelect: (tabKey: DebugTabKey) => void;
};

export function DebugConsoleTabs({ activeTab, onSelect }: DebugConsoleTabsProps) {
    return (
        <IntegratedTabs
            className="debugConsoleTabs integratedTabs--top"
            ariaLabel="Developer diagnostics panels"
            groups={[{ items: DEBUG_TABS }]}
            activeId={activeTab}
            onSelect={(tabKey) => onSelect(tabKey as DebugTabKey)}
            idPrefix="debug-console"
            getPanelId={(_, tabKey) => `debug-console-panel-${tabKey}`}
        />
    );
}
