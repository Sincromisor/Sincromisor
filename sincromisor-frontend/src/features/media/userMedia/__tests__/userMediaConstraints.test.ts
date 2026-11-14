import { afterEach, expect, it, vi } from "vitest";
import { UserMediaAcquisition } from "../userMediaAcquisition";
import { UserMediaManager } from "../userMediaManager";

vi.mock("../../vad/userMediaAudioProcessor", () => ({
    UserMediaAudioProcessor: class {},
}));

afterEach(() => vi.restoreAllMocks());

function setup() {
    const applyConstraints = vi
        .fn<(constraints: MediaTrackConstraints) => Promise<void>>()
        .mockResolvedValue();
    const track = { applyConstraints } as unknown as MediaStreamTrack; // reason: 実機境界の適用要求だけを観測する最小トラック。
    vi.spyOn(UserMediaAcquisition.prototype, "rawTrack", "get").mockReturnValue(track);
    const manager = new UserMediaManager();
    manager.setAudioInputDeviceId("microphone-fixture");
    const report = vi.fn();
    manager.setAudioConstraintRuntimeApplyCallback(report);
    return { manager, applyConstraints, report };
}

it("連続変更は元トラックへ最新の制約全体を独立した要求として渡す", async () => {
    const { manager, applyConstraints, report } = setup();
    let resolveApply = () => {};
    const pending = new Promise<void>((resolve) => {
        resolveApply = resolve;
    });
    applyConstraints.mockReturnValue(pending);
    manager.setEchoCancellation(false);
    manager.setNoiseSuppression(false);
    manager.setAutoGainControl(true);
    expect(applyConstraints.mock.calls.map(([constraints]) => constraints)).toEqual([
        expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: false,
        }),
        expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        }),
        expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
        }),
    ]);
    // ネストした制約も、後続の設定編集で送信済み要求を書き換えない。
    const audio = manager.config.audio;
    if (!audio || typeof audio === "boolean") throw new Error("Missing audio config");
    const device = audio.deviceId;
    if (!device || typeof device !== "object" || Array.isArray(device))
        throw new Error("Missing device constraint");
    device.exact = "other-fixture";
    for (const [constraints] of applyConstraints.mock.calls) {
        expect(constraints).toMatchObject({
            deviceId: { exact: "microphone-fixture" },
            channelCount: 1,
            sampleRate: 48000,
            sampleSize: 16,
        });
    }
    expect(report).not.toHaveBeenCalled();
    resolveApply();
    await pending;
    expect(report.mock.calls.map(([value]) => value.status)).toEqual([
        "applied",
        "applied",
        "applied",
    ]);
});

it("未取得では設定を保持してpendingを通知する", () => {
    const { manager, applyConstraints, report } = setup();
    vi.spyOn(UserMediaAcquisition.prototype, "rawTrack", "get").mockReturnValue(undefined);
    manager.setNoiseSuppression(false);
    expect(applyConstraints).not.toHaveBeenCalled();
    expect(manager.config.audio).toMatchObject({ noiseSuppression: false });
    expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ key: "noiseSuppression", enabled: false, status: "pending" }),
    );
});

it("適用拒否は変更項目のfailedを通知する", async () => {
    const { manager, applyConstraints, report } = setup();
    applyConstraints.mockRejectedValue(new Error("Constraint rejected"));
    manager.setAutoGainControl(true);
    await vi.waitFor(() =>
        expect(report).toHaveBeenCalledWith({
            key: "autoGainControl",
            enabled: true,
            status: "failed",
            message: "Constraint rejected",
        }),
    );
});
