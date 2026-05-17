import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { RangeControl } from "../components/RangeControl";
import { AudioPanelVadControls } from "./audioPanelVadControls";

type AudioPanelAdvancedControlsProps = {
    audio: DebugConsoleSnapshot["audio"];
    manager: DebugConsoleManager;
};

export function AudioPanelAdvancedControls({ audio, manager }: AudioPanelAdvancedControlsProps) {
    return (
        <div className="audioMeterPanel audioMeterPanel--controls">
            <details className="audioInlineDetails audioInlineDetails--controls">
                <summary>高度な調整</summary>
                <RangeControl
                    id="localAudioHighpassCutoff"
                    label="HPF Cutoff"
                    valueLabel={`${Math.round(audio.filterConfig.highpassHz)}Hz`}
                    min="60"
                    max="300"
                    step="5"
                    value={audio.filterConfig.highpassHz}
                    onChange={(value) =>
                        manager.applyLocalAudioFilterConfig({
                            ...audio.filterConfig,
                            highpassHz: value,
                        })
                    }
                />
                <div className="audioControlGroup">
                    <label className="audioControlCheckLabel" htmlFor="localAudioLowpassEnabled">
                        <input
                            id="localAudioLowpassEnabled"
                            type="checkbox"
                            checked={audio.filterConfig.lowpassEnabled}
                            onChange={(event) =>
                                manager.applyLocalAudioFilterConfig({
                                    ...audio.filterConfig,
                                    lowpassEnabled: event.currentTarget.checked,
                                })
                            }
                        />
                        LPFを有効化
                    </label>
                </div>
                <RangeControl
                    id="localAudioLowpassCutoff"
                    label="LPF Cutoff"
                    valueLabel={`${Math.round(audio.filterConfig.lowpassHz)}Hz`}
                    min="2500"
                    max="10000"
                    step="100"
                    value={audio.filterConfig.lowpassHz}
                    onChange={(value) =>
                        manager.applyLocalAudioFilterConfig({
                            ...audio.filterConfig,
                            lowpassHz: value,
                        })
                    }
                />
                <AudioPanelVadControls audio={audio} manager={manager} />
            </details>
        </div>
    );
}
