import type { DebugConsoleSnapshot } from "../../../ts/ui/debugConsoleManager";
import { AudioMeter } from "../components/audioMeter";
import {
    learnedVadFramesLabel,
    localVadEngineLabel,
    metricPercent,
    vadProbabilityLabel,
} from "../components/debugConsoleFormatters";

type AudioPanelLocalMeterProps = {
    snapshot: DebugConsoleSnapshot;
};

export function AudioPanelLocalMeter({ snapshot }: AudioPanelLocalMeterProps) {
    const { audio } = snapshot;

    return (
        <AudioMeter id="localAudioLevelMeter" label="Local Mic" level={audio.localLevel}>
            <dl className="audioMetricTable">
                <dt>VAD</dt>
                <dd>{audio.localVadIsSpeech ? "Speech" : "Silence"}</dd>
                <dt>Engine</dt>
                <dd>{localVadEngineLabel(snapshot)}</dd>
                <dt>Prob</dt>
                <dd>{vadProbabilityLabel(audio.learnedVadReport.probability)}</dd>
                <dt>Model</dt>
                <dd title={audio.learnedVadReport.message ?? ""}>
                    {audio.learnedVadReport.status}
                </dd>
                <dt>Frames</dt>
                <dd>{learnedVadFramesLabel(snapshot)}</dd>
                <dt>RMS</dt>
                <dd>{metricPercent(audio.localRms)}</dd>
                <dt>Peak</dt>
                <dd>{metricPercent(audio.localPeak)}</dd>
            </dl>
            <p
                className={`audioWarning${audio.localWarningState === "ok" ? "" : ` ${audio.localWarningState}`}`}
            >
                {audio.localWarningText}
            </p>
            <p
                className={`audioConstraintStatus ${audio.constraintStatus.tone}`.trim()}
                title={audio.constraintStatus.title}
            >
                {audio.constraintStatus.text}
            </p>
        </AudioMeter>
    );
}
