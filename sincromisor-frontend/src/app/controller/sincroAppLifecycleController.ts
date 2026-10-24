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
    mediaState: SincroAppMediaState = {
        experienceActive: false,
        microphone: "idle",
        camera: "idle",
    };
    private applied?: SincroAppStartupAppliedSettings;
    private hooks: SincroAppStartHooks = {};

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
        if (this.deps.isReleased() || this.state === "starting" || this.state === "running") return;
        const settings = this.deps.getSettings();
        this.notify("starting");
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

    /** 診断・再接続用にRTCだけを止め、機器の使用と設定購読は維持する。 */
    stopRTC(): void {
        if (this.state === "stopping" || this.state === "stopped" || this.state === "idle") return;
        this.deps.calibration.cancel("connection_stopped");
        this.notify("stopping");
        this.deps.core.stopRTC();
        this.notify("stopped");
    }

    /** RTC停止済みでも全機器と取得待ち・較正を終了し、明示再開始まで休止する。 */
    endExperience(): void {
        if (
            !this.mediaState.experienceActive &&
            this.mediaState.microphone === "idle" &&
            this.mediaState.camera === "idle"
        )
            return;
        this.deps.calibration.cancel("experience_ended");
        try {
            this.deps.core.endExperience();
        } finally {
            this.notify("stopped");
        }
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
