import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { AudioMeter } from "../components/audioMeter";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";
import { AudioPanelAdvancedControls } from "./audioPanelAdvancedControls";
import { AudioPanelLocalMeter } from "./audioPanelLocalMeter";

type AudioPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
};

/** 音声の診断値と調整だけを描画する。受信音声DOMは常設のDebugConsoleが所有する。 */
export function AudioPanel({ snapshot, manager, isActive }: AudioPanelProps) {
    return (
        <section
            id="debug-console-panel-audio"
            className={debugPanelClassName("debugCard debugCard--audio", isActive)}
            data-debug-panel="audio"
            role="tabpanel"
            aria-labelledby="debug-console-tab-audio"
            hidden={!isActive}
        >
            <div className="audioMeterGrid">
                <AudioPanelLocalMeter snapshot={snapshot} />
                <AudioMeter
                    id="remoteAudioLevelMeter"
                    label="Remote RTC"
                    level={snapshot.audio.remoteLevel}
                />
                <AudioPanelAdvancedControls audio={snapshot.audio} manager={manager} />
            </div>
        </section>
    );
}
