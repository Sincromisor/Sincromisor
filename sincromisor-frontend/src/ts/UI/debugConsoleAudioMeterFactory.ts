import { DebugConsoleAudioMeter } from "./debugConsoleAudioMeter";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type DebugConsoleAudioMeterFactoryParams = {
    updateSnapshot: (updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot) => void;
    updateLocalVadState: (isSpeech: boolean) => void;
};

// Web Audio の計測 callback を DebugConsoleSnapshot へ反映するための配線。
// manager 本体から低レベルな meter 更新処理を分離し、audio API 追加時の変更範囲を狭める。
export function createDebugConsoleAudioMeter({
    updateSnapshot,
    updateLocalVadState,
}: DebugConsoleAudioMeterFactoryParams): DebugConsoleAudioMeter {
    return new DebugConsoleAudioMeter({
        onLocalReset: () => {
            updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    localLevel: 0,
                    localRms: 0,
                    localPeak: 0,
                    localWarningState: "ok",
                    localWarningText: "Normal",
                },
            }));
            updateLocalVadState(false);
        },
        onRemoteReset: () => {
            updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    remoteLevel: 0,
                },
            }));
        },
        onLocalStats: ({ level, rms, peak }) => {
            updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    localLevel: level,
                    localRms: rms,
                    localPeak: peak,
                },
            }));
        },
        onRemoteLevel: (level) => {
            updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    remoteLevel: level,
                },
            }));
        },
        onLocalWarning: ({ state, text }) => {
            updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    localWarningState: state,
                    localWarningText: text,
                },
            }));
        },
    });
}
