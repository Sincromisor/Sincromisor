import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { SincroFaceTracker } from "../../../features/gaze/faceTracking/sincroFaceTracker";
import type { SincroTrackerWorkerOutputMessage } from "../../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../../../features/gaze/trackingRuntime/trackerRuntime";
import { UserMediaAudioProcessor } from "../../../features/media/vad/userMediaAudioProcessor";
import { SincroAppSettingsModel } from "../../settings/sincroAppSettingsModel";
import { SincroAppController } from "../sincroAppController";
import type { SincroAppEvent } from "../sincroAppTypes";
import { SincroRtcSessionController } from "../sincroRtcSessionController";

const rtc = vi.hoisted(() => ({ starts: 0, stops: 0 }));
vi.mock("../../../features/rtc/rtcTalkClient", () => ({
    RTCTalkClient: class {
        start() {
            ++rtc.starts;
        }
        stop() {
            ++rtc.stops;
        }
        setMute() {}
    },
}));
class Track extends EventTarget {
    readyState = "live";
    enabled = true;
    constructor(readonly kind: string) {
        super();
    }
    stop = vi.fn(() => {
        this.readyState = "ended";
    });
    getSettings() {
        return {};
    }
}
const raw: Track[] = [];
const processed: Track[] = [];
const pending: {
    kind: string;
    resolve: (value: object) => void;
    reject: (error: unknown) => void;
}[] = [];
let defer = false;
let audioFailure: string | undefined;
function stream(track: Track) {
    return {
        getTracks: () => [track],
        getAudioTracks: () => (track.kind === "audio" ? [track] : []),
        getVideoTracks: () => (track.kind === "video" ? [track] : []),
    };
}
async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    raw.length = processed.length = pending.length = 0;
    rtc.starts = rtc.stops = 0;
    defer = false;
    audioFailure = undefined;
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", {
        querySelector: () => ({
            setAttribute() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            videoWidth: 640,
            videoHeight: 480,
        }),
    });
    vi.stubGlobal("navigator", {
        mediaDevices: {
            getUserMedia: vi.fn((config) => {
                const kind = config.audio ? "audio" : "video";
                if (kind === "audio" && audioFailure)
                    return Promise.reject(new DOMException("private device detail", audioFailure));
                if (defer)
                    return new Promise((resolve, reject) =>
                        pending.push({ kind, resolve, reject }),
                    );
                const track = new Track(kind);
                raw.push(track);
                return Promise.resolve(stream(track));
            }),
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
    vi.spyOn(DebugConsoleManager.prototype, "setLocalAudioTrack").mockImplementation(() => {});
    vi.spyOn(UserMediaAudioProcessor.prototype, "dispose");
    vi.spyOn(TrackerRuntime.prototype, "startFaceTracking").mockResolvedValue();
    vi.spyOn(TrackerRuntime.prototype, "stopFaceTracking").mockImplementation(() => {});
    vi.spyOn(UserMediaAudioProcessor.prototype, "buildProcessedAudioTrack").mockImplementation(
        async () => {
            const track = new Track("audio");
            processed.push(track);
            return track as unknown as MediaStreamTrack; // reason: 機器境界だけを最小トラックへ置き換え、所有者による解放を観測する。
        },
    );
});
afterEach(() => {
    SincroAppController.getCurrent()?.endExperience();
    SincroAppController.getCurrent()?.releaseEventSubscriptions();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function app() {
    const value = new SincroAppController();
    value.dialog.updateCharacterAvailabilityStatus(true);
    value.dialog.updateUserMediaAvailabilityStatus(true);
    value.applySettings({
        talkMode: "sincro",
        enableCharacterGaze: true,
        enableSincroPoseTracking: true,
    });
    return value;
}
it("稼働中の全機器を終了し、設定変更から再取得せず明示再開始だけで新世代を開始する", async () => {
    const value = app();
    const events = vi.fn();
    value.subscribe(events);
    value.start();
    await settle();
    expect(raw).toHaveLength(2);
    expect(processed).toHaveLength(1);
    expect(rtc.starts).toBe(1);
    value.stopRTC();
    expect(raw.every((track) => track.readyState === "live")).toBe(true);
    const disposals = vi.mocked(UserMediaAudioProcessor.prototype.dispose).mock.calls.length;
    value.endExperience();
    value.endExperience();
    expect(vi.mocked(UserMediaAudioProcessor.prototype.dispose).mock.calls.length).toBeGreaterThan(
        disposals,
    );
    expect(TrackerRuntime.prototype.stopFaceTracking).toHaveBeenCalledWith(
        "sincro_face_tracking_stopped",
    );
    await settle();
    expect([...raw, ...processed].every((track) => track.readyState === "ended")).toBe(true);
    expect(value.calibration.getState().status).toBe("cancelled");
    const calls = vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls.length;
    value.applySettings({ audioInputDeviceId: "next", videoInputDeviceId: "next" });
    await settle();
    expect(vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls).toHaveLength(calls);
    expect(events).toHaveBeenCalledWith({
        type: "media_state",
        state: { experienceActive: false, microphone: "idle", camera: "idle" },
    });
    value.start();
    await settle();
    expect(raw).toHaveLength(4);
    expect(rtc.starts).toBe(2);
    expect(value.getSettingsSnapshot().audioInputDeviceId).toBe("next");
});
it("取得待ちの終了で後着した音声とカメラを解放し、接続・追跡を再開しない", async () => {
    const value = app();
    defer = true;
    value.start();
    await settle();
    expect(pending).toHaveLength(2);
    value.endExperience();
    for (const request of pending) {
        const track = new Track(request.kind);
        raw.push(track);
        request.resolve(stream(track));
    }
    await settle();
    expect(raw.every((track) => track.readyState === "ended")).toBe(true);
    expect(processed).toHaveLength(0);
    expect(rtc.starts).toBe(0);
    expect(TrackerRuntime.prototype.startFaceTracking).not.toHaveBeenCalled();
});
it("加工待ちの終了で元音声と後着した加工音声を解放する", async () => {
    let complete: (track: MediaStreamTrack) => void = () => {};
    vi.mocked(UserMediaAudioProcessor.prototype.buildProcessedAudioTrack).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                complete = resolve;
            }),
    );
    const value = app();
    value.start();
    await settle();
    value.endExperience();
    expect(raw.every((track) => track.readyState === "ended")).toBe(true);
    const track = new Track("audio");
    complete(track as unknown as MediaStreamTrack); // reason: 処理器から後着するトラックを最小のテスト用オブジェクトで表す。
    await settle();
    expect(track.readyState).toBe("ended");
    expect(rtc.starts).toBe(0);
});

it("マイク切替待ちを終了し、旧結果が明示再開始した体験へ割り込まない", async () => {
    const value = app();
    value.start();
    await settle();
    defer = true;
    value.applySettings({ audioInputDeviceId: "late" });
    await settle();
    expect(pending).toHaveLength(1);
    value.endExperience();
    expect([...raw, ...processed].every((track) => track.readyState === "ended")).toBe(true);
    defer = false;
    value.start();
    await settle();
    expect(rtc.starts).toBe(2);
    const late = new Track("audio");
    pending[0].resolve(stream(late));
    await settle();
    expect(late.readyState).toBe("ended");
    expect(rtc.starts).toBe(2);
    expect(raw.slice(-2).every((track) => track.readyState === "live")).toBe(true);
});

it("RTC終了の例外でも音声・カメラ・処理器を解放して失敗を返す", async () => {
    const value = app();
    value.start();
    await settle();
    vi.spyOn(SincroRtcSessionController.prototype, "stop").mockImplementationOnce(() => {
        throw new Error("shutdown failed");
    });
    expect(() => value.endExperience()).toThrow("Could not end all experience resources");
    expect([...raw, ...processed].every((track) => track.readyState === "ended")).toBe(true);
    expect(TrackerRuntime.prototype.stopFaceTracking).toHaveBeenCalledWith(
        "sincro_face_tracking_stopped",
    );
});

it("本番WorkerClientの初期化待ちを終了し、カメラの取得列を明示再開始へ進める", async () => {
    const workers: WaitingWorker[] = [];
    class WaitingWorker {
        onmessage?: (event: MessageEvent<SincroTrackerWorkerOutputMessage>) => void;
        onerror?: (event: ErrorEvent) => void;
        postMessage = vi.fn();
        terminate = vi.fn();
        constructor() {
            workers.push(this);
        }
        ready() {
            this.onmessage?.(
                new MessageEvent("message", { data: { type: "status", status: "ready" } }),
            );
        }
    }
    vi.stubGlobal("Worker", WaitingWorker);
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal(
        "MediaStream",
        class {
            addTrack() {}
        },
    );
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const video = {
        readyState: 0,
        setAttribute() {},
        pause() {},
        addEventListener() {},
        removeEventListener() {},
        videoWidth: 640,
        videoHeight: 480,
    };
    vi.stubGlobal("document", { querySelector: () => video });
    vi.mocked(TrackerRuntime.prototype.startFaceTracking).mockRestore();
    vi.mocked(TrackerRuntime.prototype.stopFaceTracking).mockRestore();
    const fallback = vi
        .spyOn(SincroFaceTracker.prototype, "initVision")
        .mockRejectedValue(new Error("cancel must not initialize fallback"));
    const value = app();
    value.start();
    await settle();
    expect(workers).toHaveLength(1);
    value.endExperience();
    await settle();
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(raw.every((track) => track.readyState === "ended")).toBe(true);
    value.start();
    await settle();
    expect(workers).toHaveLength(2);
    expect(raw).toHaveLength(4);
    // 終了済みWorkerの遅延readyは、新しい初期化の完了として受理しない。
    workers[0].ready();
    await settle();
    expect(fallback).not.toHaveBeenCalled();
    workers[1].ready();
    await settle();
    expect(raw.slice(-2).every((track) => track.readyState === "live")).toBe(true);
    value.endExperience();
    await settle();
    expect(workers[1].terminate).toHaveBeenCalled();
    expect(raw.every((track) => track.readyState === "ended")).toBe(true);
});

it.each([
    ["NotAllowedError", "permission"],
    ["NotFoundError", "not-found"],
    ["NotReadableError", "other"],
])("音声取得の%sを分類し、稼働中のカメラを維持する", async (error, reason) => {
    audioFailure = error;
    const value = app();
    const events: SincroAppEvent[] = [];
    value.subscribe((event) => events.push(event));
    value.start();
    await settle();
    expect(events).toContainEqual({
        type: "audio_input_state",
        state: { status: "failed", reason },
    });
    expect(events.filter((event) => event.type === "connection_state").slice(-1)[0]).toMatchObject({
        value: "input_failed",
    });
    expect(events.filter((event) => event.type === "lifecycle").slice(-1)[0]).toMatchObject({
        state: "running",
    });
    expect(events.filter((event) => event.type === "media_state").slice(-1)[0]).toMatchObject({
        state: { experienceActive: true, camera: "active", microphone: "idle" },
    });
    expect(events.filter((event) => event.type === "error_message")).toHaveLength(0);
    expect(JSON.stringify(events)).not.toContain("private device detail");
    expect(rtc.starts).toBe(0);
    expect(raw).toHaveLength(1);
    value.endExperience();
    expect(raw[0].readyState).toBe("ended");
});

it("音声だけを一度再試行し、設定・較正・カメラを保って現在世代から一度接続する", async () => {
    audioFailure = "NotAllowedError";
    const value = app();
    value.applySettings({ titleText: "保持する題名" });
    const beforeStart = vi.fn();
    value.setStartHooks({ beforeStart });
    value.start();
    await settle();
    const calibration = value.calibration.getState();
    const camera = raw[0];
    value.applySettings({ audioInputDeviceId: "corrected" });
    await settle();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    audioFailure = undefined;
    defer = true;
    value.retryAudioInput();
    value.retryAudioInput();
    value.start();
    await settle();
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("audio");
    const audio = new Track("audio");
    raw.push(audio);
    pending[0].resolve(stream(audio));
    await settle();
    expect(rtc.starts).toBe(1);
    expect(TrackerRuntime.prototype.startFaceTracking).toHaveBeenCalledTimes(1);
    expect(beforeStart).toHaveBeenCalledTimes(1);
    expect(value.calibration.getState()).toEqual(calibration);
    expect(camera.readyState).toBe("live");
    expect(value.getSettingsSnapshot()).toMatchObject({
        titleText: "保持する題名",
        audioInputDeviceId: "corrected",
    });
});

it.each(["success", "failure"])(
    "終了した音声再試行の後着%sが新体験を変更しない",
    async (result) => {
        audioFailure = "NotAllowedError";
        const value = app();
        const events: SincroAppEvent[] = [];
        value.subscribe((event) => events.push(event));
        value.start();
        await settle();
        audioFailure = undefined;
        defer = true;
        value.retryAudioInput();
        await settle();
        expect(pending).toHaveLength(1);
        value.endExperience();
        expect(raw.every((track) => track.readyState === "ended")).toBe(true);
        defer = false;
        value.start();
        await settle();
        expect(rtc.starts).toBe(1);
        if (result === "success") {
            const late = new Track("audio");
            pending[0].resolve(stream(late));
            await settle();
            expect(late.readyState).toBe("ended");
        } else {
            pending[0].reject(new DOMException("old denial", "NotAllowedError"));
            await settle();
        }
        expect(rtc.starts).toBe(1);
        expect(
            events.filter((event) => event.type === "audio_input_state").slice(-1)[0],
        ).toMatchObject({ state: { status: "ready" } });
        expect(raw.slice(-2).every((track) => track.readyState === "live")).toBe(true);
    },
);

it("取得を受理した直後に終了した場合、遅延して機器取得を始めない", async () => {
    const value = app();
    value.start();
    value.endExperience();
    await settle();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(rtc.starts).toBe(0);
});

it("接続停止後の音声だけの再試行も接続表示へ反映し、カメラを再取得しない", async () => {
    audioFailure = "NotAllowedError";
    const value = app();
    const events: SincroAppEvent[] = [];
    value.subscribe((event) => events.push(event));
    value.start();
    await settle();
    value.stopRTC();
    audioFailure = undefined;
    value.retryAudioInput();
    await settle();
    expect(rtc.starts).toBe(1);
    expect(TrackerRuntime.prototype.startFaceTracking).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.type === "lifecycle").slice(-1)[0]).toMatchObject({
        state: "running",
    });
    expect(events.filter((event) => event.type === "connection_state").slice(-1)[0]).toMatchObject({
        value: "connecting",
    });
});
