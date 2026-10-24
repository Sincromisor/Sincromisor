import { frontendLogger } from "../../../shared/logging/appLogger";
import { diagnosticReason } from "../../../shared/logging/browserDiagnostics";
import type { UserMediaAudioProcessor } from "../vad/userMediaAudioProcessor";
import {
    acquireRawAudioTrack,
    installMediaStreamTracks,
    stopPreviousAudioTracks,
} from "./userMediaTrackLifecycle";

/** 機器所有者が通知する使用状態。取得要求中とliveトラックの使用を区別する。 */
export type MediaUsageState = "idle" | "requesting" | "active";

/** 音声の取得世代と元・加工済みトラックを所有し、終了後の後着結果を解放する。 */
export class UserMediaAcquisition {
    audioTrack?: MediaStreamTrack;
    videoTrack?: MediaStreamTrack;
    private rawAudioTrack?: MediaStreamTrack;
    /** ブラウザーの音声制約は加工前の実マイクトラックへ適用する。 */
    get rawTrack(): MediaStreamTrack | undefined {
        return this.rawAudioTrack;
    }
    private generation = 0;
    private readonly ownedTracks = new Set<MediaStreamTrack>();
    private onUsage: (state: MediaUsageState) => void = () => {};

    constructor(private readonly processor: UserMediaAudioProcessor) {}

    /** 実際の取得開始・トラック受理・終了をアプリの使用表示へ伝える。 */
    setUsageCallback(callback: (state: MediaUsageState) => void): void {
        this.onUsage = callback;
    }

    /** コールバックAPIの取得を現在世代へ限定し、旧世代の失敗も通知しない。 */
    acquire(options: {
        config: MediaStreamConstraints;
        onAudio: (track: MediaStreamTrack) => void;
        onVideo: (track: MediaStreamTrack) => void;
        onError: (error: unknown) => void;
    }): void {
        this.close();
        const generation = this.generation;
        this.onUsage("requesting");
        // API不在など同期的な取得失敗も、同じ現在世代の結果として返す。
        void Promise.resolve()
            .then(() => {
                if (generation !== this.generation) {
                    throw new DOMException("Media acquisition cancelled", "AbortError");
                }
                return navigator.mediaDevices.getUserMedia(options.config);
            })
            .then(async (stream) => {
                if (generation !== this.generation) {
                    for (const track of stream.getTracks()) track.stop();
                    return;
                }
                for (const track of stream.getTracks()) this.ownedTracks.add(track);
                if (
                    options.config.audio &&
                    !stream.getTracks().some((track) => track.kind === "audio")
                ) {
                    throw new Error("Media acquisition returned no audio track");
                }
                await installMediaStreamTracks({
                    mediaStream: stream,
                    processAudioTrack: (track) => this.processor.buildProcessedAudioTrack(track),
                    onRawAudioTrack: (track) => {
                        this.rawAudioTrack = track;
                        this.observeUsage(track);
                    },
                    onProcessedAudioTrack: (track) => {
                        if (generation !== this.generation) {
                            track.stop();
                            return;
                        }
                        this.ownedTracks.add(track);
                        this.audioTrack = track;
                        options.onAudio(track);
                    },
                    onVideoTrack: (track) => {
                        if (generation !== this.generation) {
                            track.stop();
                            return;
                        }
                        this.videoTrack = track;
                        options.onVideo(track);
                    },
                });
            })
            .catch((error: unknown) => {
                if (generation !== this.generation) return;
                this.close();
                frontendLogger.diagnostic("microphone", diagnosticReason(error));
                frontendLogger.error("Could not acquire media.", { error });
                options.onError(error);
            });
    }

    /** 切り替え成功までは旧トラックを保持し、終了・次世代開始後の結果は受理しない。 */
    async reacquire(config: MediaStreamConstraints): Promise<MediaStreamTrack> {
        const generation = this.generation;
        const raw = await acquireRawAudioTrack(config);
        if (generation !== this.generation) {
            raw.stop();
            throw new DOMException("Media acquisition cancelled", "AbortError");
        }
        const previousRaw = this.rawAudioTrack;
        const previousProcessed = this.audioTrack;
        this.ownedTracks.add(raw);
        this.rawAudioTrack = raw;
        this.observeUsage(raw);
        try {
            const processed = await this.processor.buildProcessedAudioTrack(raw);
            if (generation !== this.generation) {
                processed.stop();
                raw.stop();
                throw new DOMException("Media acquisition cancelled", "AbortError");
            }
            processed.enabled = previousProcessed?.enabled ?? true;
            this.ownedTracks.add(processed);
            this.audioTrack = processed;
            stopPreviousAudioTracks(previousRaw, previousProcessed);
            if (previousRaw) this.ownedTracks.delete(previousRaw);
            if (previousProcessed) this.ownedTracks.delete(previousProcessed);
            return processed;
        } catch (error) {
            raw.stop();
            stopPreviousAudioTracks(previousRaw, previousProcessed);
            if (generation === this.generation) this.close();
            throw error;
        }
    }

    /** 後着結果を無効化してから元・加工済みトラックと音声処理を終了する。繰り返し可能。 */
    close(): void {
        ++this.generation;
        for (const track of this.ownedTracks) track.stop();
        this.ownedTracks.clear();
        this.audioTrack = undefined;
        this.rawAudioTrack = undefined;
        this.videoTrack = undefined;
        this.processor.dispose();
        this.onUsage("idle");
    }

    private observeUsage(track: MediaStreamTrack): void {
        this.onUsage(track.readyState === "ended" ? "idle" : "active");
        track.addEventListener(
            "ended",
            () => {
                if (this.rawAudioTrack === track) this.onUsage("idle");
            },
            { once: true },
        );
    }
}
