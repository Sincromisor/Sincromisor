import { frontendLogger } from "../../shared/logging/appLogger";
import { emitSincroAppLifecycle } from "../events/sincroAppEmitHelpers";
import {
    buildStartupSettingsStatus,
    type SincroAppStartupAppliedSettings,
} from "../settings/sincroAppStartupSettings";
import type { SincroAppCalibration } from "./sincroAppCalibration";
import type {
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppMediaState,
    SincroAppSettingsSnapshot,
    SincroAppStartHooks,
} from "./sincroAppTypes";
import type { SincroAudioInputState } from "./sincroAudioInputState";
import type { SincroController } from "./sincroController";

type LifecycleDependencies = {
    core: SincroController;
    calibration: SincroAppCalibration;
    getSettings: () => SincroAppSettingsSnapshot;
    isReleased: () => boolean;
    emitEvent: (event: SincroAppEvent) => void;
    emitConnectionState: () => void;
};

/** アプリの明示開始・接続停止・体験終了を所有し、設定と機器の生存期間を分ける。 */
export class SincroAppLifecycleController {
    state: SincroAppLifecycleState = "idle";
    audioInputState: SincroAudioInputState = { status: "idle" };
    mediaState: SincroAppMediaState = {
        experienceActive: false,
        microphone: "idle",
        camera: "idle",
    };
    private applied?: SincroAppStartupAppliedSettings;
    private hooks: SincroAppStartHooks = {};
    /** 待機中の開始だけを無効化する世代。選択側の共有復元・保存は継続する。 */
    private startGeneration = 0;
    private preparing = false;
    private preparationAbort?: AbortController;

    constructor(private readonly deps: LifecycleDependencies) {}

    /** 初期化処理のシーン開始・ダイアログ終了を、明示開始の前後へ結ぶ。 */
    setStartHooks(hooks: SincroAppStartHooks): void {
        this.hooks = hooks;
    }

    /** 所有者から届いた実使用状態を、再購読時の初期通知にも保持する。 */
    updateMediaState(state: SincroAppMediaState): void {
        this.mediaState = state;
    }

    /** 設定復元後の明示開始だけを受理し、重複操作と終了済みアプリの開始を抑止する。 */
    start(): void {
        // 接続停止後の開始は従来の再開始とし、稼働中の音声失敗だけを個別再試行へ渡す。
        if (
            this.state === "running" &&
            this.audioInputState.status === "failed" &&
            this.mediaState.experienceActive
        ) {
            this.retryAudioInput();
            return;
        }
        if (this.deps.isReleased() || this.state === "starting" || this.state === "running") return;
        const generation = ++this.startGeneration;
        const preparationAbort = new AbortController();
        this.preparationAbort = preparationAbort;
        this.preparing = true;
        this.notify("starting");
        if (generation !== this.startGeneration || this.deps.isReleased()) return;
        let preparation: Promise<void> | undefined;
        try {
            preparation = this.hooks.prepareStart?.(preparationAbort.signal);
        } catch (error) {
            this.preparing = false;
            preparationAbort.abort();
            this.notify("stopped");
            throw error;
        }
        if (!preparation) {
            if (generation !== this.startGeneration || this.deps.isReleased()) return;
            this.preparing = false;
            this.preparationAbort = undefined;
            this.startPrepared();
            return;
        }
        void preparation
            .then(() => {
                if (generation !== this.startGeneration || this.deps.isReleased()) return;
                this.preparing = false;
                this.preparationAbort = undefined;
                this.startPrepared();
            })
            .catch((error) => {
                if (generation !== this.startGeneration || this.deps.isReleased()) return;
                this.preparing = false;
                preparationAbort.abort();
                this.notify("stopped");
                frontendLogger.error("Failed to start prepared VRM page.", { error });
            });
    }

    /** 準備中に変わった設定もここで確定し、較正・機器・シーンを一度だけ開始する。 */
    private startPrepared(): void {
        const settings = this.deps.getSettings();
        this.applied = {
            enableTalk: settings.enableTalk,
            enableInspector: settings.enableInspector,
            enableVR: settings.enableVR,
        };
        const cancel = this.deps.calibration.start(settings.talkMode);
        try {
            this.hooks.beforeStart?.();
            this.deps.core.start(cancel);
            this.hooks.afterStart?.();
            this.notify("running");
        } catch (error) {
            cancel("start_failed");
            this.deps.core.endExperience();
            this.notify("stopped");
            throw error;
        }
    }

    /** 音声失敗から一度だけ取得を再試行し、稼働中の追跡と体験を維持する。 */
    retryAudioInput(): void {
        if (
            this.deps.isReleased() ||
            !this.mediaState.experienceActive ||
            this.audioInputState.status !== "failed"
        )
            return;
        // RTC停止後も残っている音声失敗からの明示回復では、追跡を再開せず接続表示だけを戻す。
        if (this.state === "stopped") this.notify("running");
        this.deps.core.retryAudioInput();
    }

    /** 診断・再接続用にRTCだけを止め、機器の使用と設定購読は維持する。 */
    stopRTC(): void {
        if (this.cancelPreparingStart() && !this.mediaState.experienceActive) {
            this.notify("stopped");
            return;
        }
        if (this.state === "stopping" || this.state === "stopped" || this.state === "idle") return;
        this.deps.calibration.cancel("connection_stopped");
        this.notify("stopping");
        this.deps.core.stopRTC();
        this.notify("stopped");
    }

    /** RTC停止済みでも全機器と取得待ち・較正を終了し、明示再開始まで休止する。 */
    endExperience(): void {
        const cancelled = this.cancelPreparingStart();
        if (
            !this.mediaState.experienceActive &&
            this.mediaState.microphone === "idle" &&
            this.mediaState.camera === "idle"
        ) {
            if (cancelled) this.notify("stopped");
            return;
        }
        this.deps.calibration.cancel("experience_ended");
        try {
            this.deps.core.endExperience();
        } finally {
            this.notify("stopped");
        }
    }

    /** 選択変更・アプリ解除は準備中の開始だけを取り消し、既存の機器範囲を変えない。 */
    cancelPendingStart(): void {
        if (this.cancelPreparingStart()) this.notify("stopped");
    }

    /** 所有アプリの解除時に、開始継続と初期化処理の遅延結果を無効にする。 */
    release(): void {
        this.cancelPendingStart();
        this.hooks.onRelease?.();
    }

    /** 機器未使用時の早期終了より先に、後着する開始継続だけを無効化する。 */
    private cancelPreparingStart(): boolean {
        ++this.startGeneration;
        this.preparationAbort?.abort();
        this.preparationAbort = undefined;
        if (!this.preparing) return false;
        this.preparing = false;
        return true;
    }

    /** 開始時だけ効く設定を適用済み値と比較し、保存とは別に反映待ちを導出する。 */
    getStartupSettingsStatus(current: SincroAppSettingsSnapshot) {
        return buildStartupSettingsStatus({
            lifecycleState: this.state,
            current,
            applied: this.applied,
        });
    }

    private notify(state: SincroAppLifecycleState): void {
        this.state = state;
        emitSincroAppLifecycle(
            this.deps.emitEvent,
            state,
            this.getStartupSettingsStatus(this.deps.getSettings()),
        );
        this.deps.emitConnectionState();
    }
}
