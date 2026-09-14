import type { InitialCalibrationStepId } from "../../character/calibration/initialSincroCalibration";
import {
    InitialSincroCalibrationController,
    type InitialSincroCalibrationControllerState,
} from "../../character/calibration/initialSincroCalibrationController";
import type { SincroAppSettingsModel } from "../settings/sincroAppSettingsModel";

/** アプリごとの較正を所有する。Pose評価器はcontrollerを共有し、UIは状態と再試行だけを利用する。 */
export class SincroAppCalibration {
    private static nextSession = 0;
    /** 同じアプリのPose観測を受ける評価先。アプリ間では共有しない。 */
    readonly controller = new InitialSincroCalibrationController();

    /** 表示用の現在状態を取得する。 */
    getState(): InitialSincroCalibrationControllerState {
        return this.controller.getState();
    }

    /** 現在状態と以後の評価・中断を通知し、戻り値で表示の購読だけを解除する。 */
    subscribe(listener: (state: InitialSincroCalibrationControllerState) => void): () => void {
        return this.controller.subscribe(listener);
    }

    /** 重複抑止後の開始だけが呼ぶ。遅延した追跡失敗は、この開始のsessionだけを中断できる。 */
    start(talkMode: string): (reason: string) => void {
        if (talkMode !== "sincro") return () => {};
        const sessionId = `sincro-calibration:${++SincroAppCalibration.nextSession}`;
        this.controller.dispatch({ type: "start", sessionId, mediaTimeMs: performance.now() });
        return (reason) => {
            this.controller.dispatch({ type: "cancel", sessionId, reason });
        };
    }

    /** 接続停止・設定変更・アプリ解除で、そのアプリの有効な較正だけを中断する。 */
    cancel(reason: string): void {
        const state = this.getState();
        if (state.status === "active") {
            this.controller.dispatch({ type: "cancel", sessionId: state.sessionId, reason });
        }
    }

    /** 段階の再試行は既存のsession検査と後続段階の破棄規則へ委譲する。 */
    retry(stepId: InitialCalibrationStepId): void {
        const state = this.getState();
        if (state.status === "active") {
            this.controller.dispatch({ type: "retry", sessionId: state.sessionId, stepId });
        }
    }

    /** 設定の適用結果を監視する。既定カメラへの復帰や利用不可による追跡停止も中断する。 */
    connectSettings(settings: SincroAppSettingsModel): () => void {
        let previous = settings.getSettings();
        return settings.subscribeSettingsChange(() => {
            const next = settings.getSettings();
            if (next.talkMode !== "sincro") this.cancel("talk_mode_leave");
            else if (next.videoInputDeviceId !== previous.videoInputDeviceId)
                this.cancel("camera_changed");
            else if (!next.enableCharacterGaze || !next.enableSincroPoseTracking)
                this.cancel("tracking_stopped");
            previous = next;
        });
    }
}
