import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CharacterBehaviorState } from "../../../character/behavior/characterBehaviorState";
import { DialogManager } from "../../../features/dialog/model/dialogManager";
import { DialogVrmWorkflowService } from "../../../features/dialog/model/dialogVrmWorkflowService";
import { buildConfigurationDialogActions } from "../../../features/dialog/react/configurationDialogActions";
import { TrackerRuntime } from "../../../features/gaze/trackingRuntime/trackerRuntime";
import type { TrackerRuntimeCallbacks } from "../../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { UserMediaManager } from "../../../features/media/userMedia/userMediaManager";
import { VideoInputManager } from "../../../features/media/userMedia/videoInputManager";
import { SincroAppSettingsModel } from "../../settings/sincroAppSettingsModel";
import { SincroAppController } from "../sincroAppController";

// RTCのネットワーク境界だけを代替し、セッション制御の失敗通知は実装を通す。
vi.mock("../../../features/rtc/rtcTalkClient", () => ({
    RTCTalkClient: class {
        rtcHealthCallback: (message?: string) => void = () => {};
        start() {
            this.rtcHealthCallback("test rtc failed");
            return Promise.resolve();
        }
        stop() {}
        setMute() {}
    },
}));
const callbacks: TrackerRuntimeCallbacks[] = [];
const tracks: MediaStreamTrack[] = [];

function track(): MediaStreamTrack {
    const value = Object.assign(new EventTarget(), {
        stop: vi.fn(),
        getSettings: () => ({}),
        readyState: "live",
    });
    tracks.push(value as unknown as MediaStreamTrack);
    return tracks[tracks.length - 1];
}

beforeEach(() => {
    callbacks.length = 0;
    tracks.length = 0;
    vi.stubGlobal("window", new EventTarget());
    const video = {
        setAttribute() {},
        pause() {},
        addEventListener() {},
        removeEventListener() {},
        videoWidth: 640,
        videoHeight: 480,
    };
    vi.stubGlobal("document", { querySelector: () => video });
    vi.stubGlobal("navigator", {
        mediaDevices: {
            getUserMedia: vi.fn(),
            enumerateDevices: async () => [],
            addEventListener() {},
            removeEventListener() {},
        },
    });
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                offerURL: "/offer",
                candidateURL: "/candidate",
                iceServers: [],
            }),
        }),
    );
    vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
    vi.spyOn(SincroAppSettingsModel.prototype, "connectMediaDevices").mockReturnValue(() => {});
    // 実機取得と推論エンジンだけを代替し、アプリ→中核→視線制御→較正は実装を通す。
    vi.spyOn(VideoInputManager.prototype, "reacquireVideoTrack").mockImplementation(async () =>
        track(),
    );
    vi.spyOn(TrackerRuntime.prototype, "startFaceTracking").mockImplementation(
        async (_track, handlers) => {
            callbacks.push(handlers);
        },
    );
    vi.spyOn(TrackerRuntime.prototype, "stopFaceTracking").mockImplementation(() => {});
    vi.spyOn(UserMediaManager.prototype, "getUserMedia").mockImplementation(
        (_audio, _video, error) => {
            error(new Error("audio unavailable"));
        },
    );
});

afterEach(() => {
    SincroAppController.getCurrent()?.releaseEventSubscriptions();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function createApp(): SincroAppController {
    const app = new SincroAppController();
    app.dialog.updateCharacterAvailabilityStatus(true);
    app.dialog.updateUserMediaAvailabilityStatus(true);
    app.applySettings({
        talkMode: "sincro",
        enableCharacterGaze: true,
        enableSincroPoseTracking: true,
        videoInputDeviceId: "camera-a",
    });
    return app;
}

async function settle(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

it("実際の開始窓口で較正を開始し、音声・RTC不通では維持し、設定と選択操作で中断する", async () => {
    const app = createApp();
    buildConfigurationDialogActions(app).startApp();
    const active = app.calibration.getState();
    expect(active.status).toBe("active");
    app.start();
    expect(app.calibration.getState()).toBe(active);
    await settle();
    expect(callbacks).toHaveLength(1);
    expect(app.calibration.getState()).toBe(active);
    // キャッシュの初期復元は利用者の選択通知にならない。
    await settle();
    expect(app.calibration.getState()).toBe(active);
    app.stop();
    // 音声取得成功後にRTCだけが失敗しても、カメラの較正を中断しない。
    const rtcError = vi.spyOn(CharacterBehaviorState.getManager(), "setErrorSource");
    vi.mocked(UserMediaManager.prototype.getUserMedia).mockImplementationOnce((audio) => {
        audio(track());
    });
    app.start();
    await settle();
    expect(app.calibration.getState().status).toBe("active");
    expect(rtcError).toHaveBeenCalledWith("rtc", "test rtc failed");
    app.applySettings({ videoInputDeviceId: undefined });
    expect(app.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "camera_changed",
    });
    for (const change of [
        { talkMode: "chat" },
        { enableCharacterGaze: false },
        { enableSincroPoseTracking: false },
    ]) {
        app.stop();
        app.applySettings({
            talkMode: "sincro",
            enableCharacterGaze: true,
            enableSincroPoseTracking: true,
        });
        app.start();
        expect(app.calibration.getState().status).toBe("active");
        app.applySettings(change);
        expect(app.calibration.getState().status, JSON.stringify(change)).toBe("cancelled");
    }
    app.stop();
    app.applySettings({ talkMode: "chat" });
    const cancelled = app.calibration.getState();
    app.start();
    expect(app.calibration.getState()).toBe(cancelled);
    app.stop();
    app.applySettings({
        talkMode: "sincro",
        enableCharacterGaze: true,
        enableSincroPoseTracking: true,
    });
    app.start();
    // 非同期の保存完了を待たず、同じVRMを再選択した時点でも較正を中断する。
    vi.spyOn(DialogVrmWorkflowService.prototype, "applySelectedVrmFile").mockReturnValue(
        new Promise(() => {}),
    );
    DialogManager.getManager().applySelectedVrmFile(new File(["vrm"], "same.vrm"));
    expect(app.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "vrm_source_changed",
    });
});

it("同期例外・カメラ拒否・追跡初期化失敗と実行終了を中断へ返す", async () => {
    const app = createApp();
    app.setStartHooks({
        beforeStart: () => {
            throw new Error("sync start");
        },
    });
    expect(() => app.start()).toThrow("sync start");
    expect(app.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "start_failed",
    });
    app.setStartHooks({});
    vi.mocked(VideoInputManager.prototype.reacquireVideoTrack).mockRejectedValueOnce(
        new Error("denied"),
    );
    app.start();
    await settle();
    expect(app.calibration.getState().status).toBe("cancelled");
    app.stop();
    vi.mocked(TrackerRuntime.prototype.startFaceTracking).mockRejectedValueOnce(
        new Error("init failed"),
    );
    app.start();
    await settle();
    expect(app.calibration.getState().status).toBe("cancelled");
    app.stop();
    app.start();
    await settle();
    callbacks[callbacks.length - 1].onError?.(new Error("runtime failed"));
    expect(app.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "tracking_failed",
    });
    app.stop();
    app.start();
    await settle();
    tracks[tracks.length - 1].dispatchEvent(new Event("ended"));
    expect(app.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "camera_ended",
    });
});

it("遅延した旧開始結果・旧フレーム・旧解除が再開始と新アプリの較正を変えない", async () => {
    const old = createApp();
    let rejectCamera!: (error: Error) => void;
    vi.mocked(VideoInputManager.prototype.reacquireVideoTrack).mockImplementationOnce(
        () =>
            new Promise((_resolve, reject) => {
                rejectCamera = reject;
            }),
    );
    old.start();
    await settle();
    old.stop();
    old.start();
    const restarted = old.calibration.getState();
    rejectCamera(new Error("old camera"));
    await settle();
    expect(old.calibration.getState()).toBe(restarted);
    const oldCallbacks = callbacks[callbacks.length - 1];
    old.stop();
    old.start();
    const nextSession = old.calibration.getState();
    oldCallbacks.onError?.(new Error("old tracker"));
    expect(old.calibration.getState()).toBe(nextSession);
    await settle();
    old.stop();
    let rejectTracker!: (error: Error) => void;
    vi.mocked(TrackerRuntime.prototype.startFaceTracking).mockImplementationOnce(
        () =>
            new Promise((_resolve, reject) => {
                rejectTracker = reject;
            }),
    );
    old.start();
    await settle();
    old.stop();
    old.start();
    const afterOldInit = old.calibration.getState();
    rejectTracker(new Error("old init"));
    await settle();
    expect(old.calibration.getState()).toBe(afterOldInit);
    const current = createApp();
    current.start();
    await settle();
    const active = current.calibration.getState();
    expect(old.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "app_released",
    });
    old.releaseEventSubscriptions();
    oldCallbacks.onError?.(new Error("old app"));
    // 無効な引数でも旧世代ガードで評価器へ届かない。
    oldCallbacks.onPoseMotion?.(undefined as never);
    expect(current.calibration.getState()).toBe(active);
    current.stop();
    expect(current.calibration.getState()).toMatchObject({
        status: "cancelled",
        reason: "connection_stopped",
    });
});
