import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { AudioMeter } from "../components/audioMeter";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";
import { AudioPanelAdvancedControls } from "./audioPanelAdvancedControls";
import { AudioPanelLocalMeter } from "./audioPanelLocalMeter";

type AudioPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
};

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
            <h3>Audio</h3>
            <div className="audioMeterGrid">
                <AudioPanelLocalMeter snapshot={snapshot} />
                <AudioMeter
                    id="remoteAudioLevelMeter"
                    label="Remote RTC"
                    level={snapshot.audio.remoteLevel}
                />
                <AudioPanelAdvancedControls audio={snapshot.audio} manager={manager} />
            </div>
            {/* biome-ignore lint/a11y/useMediaCaption: RTC の受信音声出力であり、対応する字幕トラックは存在しない。 */}
            <audio id="rtcAudio" autoPlay={true}></audio>
        </section>
    );
}
