import type { DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { LogViewer } from "../components/logViewer";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";

type MessagesPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
};

export function MessagesPanel({ snapshot, isActive }: MessagesPanelProps) {
    return (
        <section
            id="debug-console-panel-messages"
            className={debugPanelClassName("debugCard debugCard--messages", isActive)}
            data-debug-panel="messages"
            role="tabpanel"
            aria-labelledby="debug-console-tab-messages"
            hidden={!isActive}
        >
            <h3>Messages</h3>
            <div className="channelGrid">
                <LogViewer id="textChannel" title="text_ch" value={snapshot.rtc.textChannelLog} />
                <LogViewer
                    id="telopChannel"
                    title="telop_ch"
                    value={snapshot.rtc.telopChannelLog}
                />
                <LogViewer
                    id="rtcEventLog"
                    title="RTC Event Timeline"
                    value={snapshot.rtc.rtcEventLog}
                />
            </div>
        </section>
    );
}
