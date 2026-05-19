import { frontendLogger } from "../../../shared/logging/appLogger";

type AudioMeterTarget = "local" | "remote";

type AudioMeterHandle = {
    audioContext: AudioContext;
    sourceNode: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array;
    frameId: number;
    lowInputFrames: number;
    clippingHoldFrames: number;
    displayLevel: number;
    lastMeterUpdateAt: number;
};

type LocalWarningState = "ok" | "silent" | "error";

type LocalAudioStats = {
    level: number;
    rms: number;
    peak: number;
};

type LocalAudioWarning = {
    state: LocalWarningState;
    text: string;
};

type DebugConsoleAudioMeterCallbacks = {
    onLocalReset: () => void;
    onRemoteReset: () => void;
    onLocalStats: (stats: LocalAudioStats) => void;
    onRemoteLevel: (level: number) => void;
    onLocalWarning: (warning: LocalAudioWarning) => void;
};

// Web Audio の測定ループと警告 state machine を DebugConsoleManager 本体から分離する。
export class DebugConsoleAudioMeter {
    private static readonly AUDIO_CLIP_THRESHOLD = 0.98;
    private static readonly AUDIO_LOW_INPUT_THRESHOLD = 0.015;
    private static readonly AUDIO_LOW_INPUT_HOLD_FRAMES = 120;
    private static readonly AUDIO_CLIP_HOLD_FRAMES = 30;
    private static readonly AUDIO_WARNING_SWITCH_HOLD_FRAMES = 18;
    private static readonly AUDIO_METER_UPDATE_INTERVAL_MS = 80;

    private localAudioMeterHandle?: AudioMeterHandle;
    private remoteAudioMeterHandle?: AudioMeterHandle;
    private localAudioWarningState: LocalWarningState = "ok";
    private localAudioWarningPendingState: LocalWarningState = "ok";
    private localAudioWarningPendingFrames = 0;

    constructor(private readonly callbacks: DebugConsoleAudioMeterCallbacks) {}

    setLocalAudioTrack(track: MediaStreamTrack): void {
        this.stopAudioMeter(this.localAudioMeterHandle, "local");
        this.localAudioMeterHandle = this.startAudioMeter(track, "local");
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        this.stopAudioMeter(this.remoteAudioMeterHandle, "remote");
        this.remoteAudioMeterHandle = this.startAudioMeter(track, "remote");
    }

    private applyLocalWarningState(nextState: LocalWarningState): void {
        if (nextState === this.localAudioWarningState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 0;
            return;
        }
        if (nextState !== this.localAudioWarningPendingState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 1;
            return;
        }
        this.localAudioWarningPendingFrames += 1;
        if (
            this.localAudioWarningPendingFrames <
            DebugConsoleAudioMeter.AUDIO_WARNING_SWITCH_HOLD_FRAMES
        ) {
            return;
        }
        this.localAudioWarningState = nextState;
        this.localAudioWarningPendingFrames = 0;
        const text =
            nextState === "error" ? "Clipping" : nextState === "silent" ? "Silence" : "Normal";
        this.callbacks.onLocalWarning({ state: nextState, text });
    }

    private stopAudioMeter(handle: AudioMeterHandle | undefined, target: AudioMeterTarget): void {
        if (!handle) {
            return;
        }
        cancelAnimationFrame(handle.frameId);
        handle.sourceNode.disconnect();
        handle.analyser.disconnect();
        handle.audioContext.close().catch((error) => {
            frontendLogger.error("Failed to close audio meter context.", { error });
        });
        if (target === "local") {
            this.localAudioMeterHandle = undefined;
            this.localAudioWarningState = "ok";
            this.localAudioWarningPendingState = "ok";
            this.localAudioWarningPendingFrames = 0;
            this.callbacks.onLocalReset();
            return;
        }
        this.remoteAudioMeterHandle = undefined;
        this.callbacks.onRemoteReset();
    }

    private startAudioMeter(
        track: MediaStreamTrack,
        target: AudioMeterTarget,
    ): AudioMeterHandle | undefined {
        if (track.kind !== "audio") {
            return undefined;
        }
        const audioContext = new AudioContext();
        const mediaStream = new MediaStream([track]);
        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.65;
        sourceNode.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const handle: AudioMeterHandle = {
            audioContext,
            sourceNode,
            analyser,
            data,
            frameId: 0,
            lowInputFrames: 0,
            clippingHoldFrames: 0,
            displayLevel: 0,
            lastMeterUpdateAt: 0,
        };
        const loop = (): void => {
            analyser.getByteTimeDomainData(data);
            const { peak, rms } = calculateAudioLevels(data);
            handle.displayLevel = Math.max(handle.displayLevel * 0.82, peak);
            const now = performance.now();
            if (
                now - handle.lastMeterUpdateAt >=
                DebugConsoleAudioMeter.AUDIO_METER_UPDATE_INTERVAL_MS
            ) {
                handle.lastMeterUpdateAt = now;
                this.updateMeterSnapshot(handle, target, rms, peak);
            }
            handle.frameId = requestAnimationFrame(loop);
        };
        handle.frameId = requestAnimationFrame(loop);
        return handle;
    }

    private updateMeterSnapshot(
        handle: AudioMeterHandle,
        target: AudioMeterTarget,
        rms: number,
        peak: number,
    ): void {
        if (target === "local") {
            this.updateLocalMeterSnapshot(handle, rms, peak);
            return;
        }
        this.callbacks.onRemoteLevel(handle.displayLevel);
    }

    private updateLocalMeterSnapshot(handle: AudioMeterHandle, rms: number, peak: number): void {
        if (peak >= DebugConsoleAudioMeter.AUDIO_CLIP_THRESHOLD) {
            handle.clippingHoldFrames = DebugConsoleAudioMeter.AUDIO_CLIP_HOLD_FRAMES;
        } else {
            handle.clippingHoldFrames = Math.max(0, handle.clippingHoldFrames - 1);
        }
        if (rms <= DebugConsoleAudioMeter.AUDIO_LOW_INPUT_THRESHOLD) {
            handle.lowInputFrames += 1;
        } else {
            handle.lowInputFrames = 0;
        }
        const nextWarningState: LocalWarningState =
            handle.clippingHoldFrames > 0
                ? "error"
                : handle.lowInputFrames >= DebugConsoleAudioMeter.AUDIO_LOW_INPUT_HOLD_FRAMES
                  ? "silent"
                  : "ok";
        this.applyLocalWarningState(nextWarningState);
        this.callbacks.onLocalStats({
            level: handle.displayLevel,
            rms,
            peak,
        });
    }
}

function calculateAudioLevels(data: Uint8Array): { peak: number; rms: number } {
    let squareSum = 0;
    let peak = 0;
    for (let index = 0; index < data.length; index += 1) {
        const normalized = (data[index] - 128) / 128;
        squareSum += normalized * normalized;
        peak = Math.max(peak, Math.abs(normalized));
    }
    return {
        peak,
        rms: Math.sqrt(squareSum / data.length),
    };
}
