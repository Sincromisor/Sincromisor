import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { DebugCheckboxControl } from "../components/debugCheckboxControl";
import {
    type DebugRangeControlItem,
    DebugRangeControlList,
} from "../components/debugRangeControls";
import { AudioPanelVadControls } from "./audioPanelVadControls";

type AudioPanelAdvancedControlsProps = {
    audio: DebugConsoleSnapshot["audio"];
    manager: DebugConsoleManager;
};

export function AudioPanelAdvancedControls({ audio, manager }: AudioPanelAdvancedControlsProps) {
    const ranges: DebugRangeControlItem[] = [
        {
            id: "localAudioHighpassCutoff",
            label: "HPF Cutoff",
            valueLabel: `${Math.round(audio.filterConfig.highpassHz)}Hz`,
            min: 60,
            max: 300,
            step: 5,
            value: audio.filterConfig.highpassHz,
            onChange: (value) =>
                manager.applyLocalAudioFilterConfig({
                    ...audio.filterConfig,
                    highpassHz: value,
                }),
        },
        {
            id: "localAudioLowpassCutoff",
            label: "LPF Cutoff",
            valueLabel: `${Math.round(audio.filterConfig.lowpassHz)}Hz`,
            min: 2500,
            max: 10000,
            step: 100,
            value: audio.filterConfig.lowpassHz,
            onChange: (value) =>
                manager.applyLocalAudioFilterConfig({
                    ...audio.filterConfig,
                    lowpassHz: value,
                }),
        },
    ];

    return (
        <div className="audioMeterPanel audioMeterPanel--controls">
            <details className="audioInlineDetails audioInlineDetails--controls">
                <summary>高度な調整</summary>
                <DebugRangeControlList items={ranges.slice(0, 1)} />
                <div className="audioControlGroup">
                    <DebugCheckboxControl
                        id="localAudioLowpassEnabled"
                        label="LPFを有効化"
                        checked={audio.filterConfig.lowpassEnabled}
                        onChange={(checked) =>
                            manager.applyLocalAudioFilterConfig({
                                ...audio.filterConfig,
                                lowpassEnabled: checked,
                            })
                        }
                    />
                </div>
                <DebugRangeControlList items={ranges.slice(1)} />
                <AudioPanelVadControls audio={audio} manager={manager} />
            </details>
        </div>
    );
}
