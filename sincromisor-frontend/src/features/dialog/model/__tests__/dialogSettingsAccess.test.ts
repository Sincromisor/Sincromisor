import { afterEach, expect, it, vi } from "vitest";
import { applySincroAppSettingsPartial } from "../../../../app/settings/sincroAppSettingsApply";
import { SincroAppSettingsModel } from "../../../../app/settings/sincroAppSettingsModel";
import { buildSincroAppSettingsSnapshot } from "../../../../app/settings/sincroAppSettingsSnapshotBuilder";
import { DialogManager } from "../dialogManager";

afterEach(() => vi.unstubAllGlobals());

const effects = vi.hoisted(() => ({ talkMode: vi.fn() }));

// ブラウザーとVRM保存だけを置き換え、設定の状態・表示規則・通知は本番実装を通す。
vi.mock("../../../../character/behavior/characterBehaviorState", () => ({
    CharacterBehaviorState: { getManager: () => ({ setTalkMode: effects.talkMode }) },
}));
vi.mock("../dialogVrmStateController", () => ({
    DialogVrmStateController: class {
        async loadInitialVrmSelection() {}
    },
}));
vi.mock("../../../media/devices/sincroMediaDeviceService", () => ({
    SincroMediaDeviceService: {
        getInstance: () => ({
            start() {},
            subscribe: () => () => {},
            async refresh() {},
            getSelectionState: (_kind: string, deviceId: string | undefined) => ({
                isSelected: deviceId !== undefined,
                availabilityKnown: true,
                isAvailable: deviceId !== "missing",
            }),
        }),
    },
}));

it("起動前後で設定を共有し、操作制限・補正・機器表示と一括通知を維持する", () => {
    vi.stubGlobal("window", new EventTarget());
    const settings = SincroAppSettingsModel.getShared();
    const dialog = DialogManager.getManager(settings);
    const snapshots: ReturnType<typeof buildSincroAppSettingsSnapshot>[] = [];
    const unsubscribe = settings.subscribeSettingsChange(() => {
        snapshots.push(buildSincroAppSettingsSnapshot(settings));
    });

    // 操作不可の項目だけを指定した更新では値も通知も変えない。
    settings.updateSettings({ enableCharacter: false, enableAutoMute: true });
    expect(settings.getSetting("enableCharacter")).toBe(true);
    expect(settings.getSetting("enableAutoMute")).toBe(false);
    expect(snapshots).toHaveLength(0);

    applySincroAppSettingsPartial(settings, {
        enableVadGate: true,
        enableNoiseSuppression: false,
        enableAutoMute: true,
        titleText: "",
        talkMode: "sincro",
        audioInputDeviceId: "missing",
        videoInputDeviceId: "missing",
        characterMotionScale: 2,
        sincroPoseRetargetScale: 0.68,
        characterEyeTrackingScale: Number.NaN,
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
        enableVadGate: true,
        enableNoiseSuppression: false,
        enableAutoMute: false,
        titleText: "Sincromisor",
        talkMode: "sincro",
        characterMotionScale: 1.2,
        sincroPoseRetargetScale: 0.7,
        characterEyeTrackingScale: 0,
    });
    expect(effects.talkMode).toHaveBeenLastCalledWith("sincro");
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(true);
    expect(settings.settingsUiHints().audioInputDeviceReason).toContain("見つからない");

    // 起動前ダイアログを閉じても、開始後パネルは同じ適用処理とスナップショットを使う。
    dialog.closeDialog();
    applySincroAppSettingsPartial(settings, {
        enableVadGate: false,
        enableNoiseSuppression: undefined,
        audioInputDeviceId: undefined,
        videoInputDeviceId: undefined,
        characterMotionScale: -1,
    });
    expect(snapshots).toHaveLength(2);
    expect(buildSincroAppSettingsSnapshot(settings)).toMatchObject({
        enableVadGate: false,
        enableNoiseSuppression: false,
        audioInputDeviceId: undefined,
        videoInputDeviceId: undefined,
        characterMotionScale: 0,
    });
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(false);
    expect(settings.settingsUiHints().audioInputDeviceReason).toBeUndefined();
    dialog.showDialog();
    expect(settings.getSettings().enableVadGate).toBe(false);

    settings.updateCharacterStatus(true);
    settings.updateSettings({ videoInputDeviceId: "missing", enableCharacterGaze: false });
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(false);
    settings.updateSettings({ enableCharacterGaze: true });
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(true);

    const copy = settings.getSettings();
    copy.enableVadGate = true;
    expect(settings.getSetting("enableVadGate")).toBe(false);
    unsubscribe();
    const count = snapshots.length;
    applySincroAppSettingsPartial(settings, { lgNumViews: 32 });
    expect(settings.getSettings()).not.toHaveProperty("lgNumViews");
    expect(buildSincroAppSettingsSnapshot(settings).lgNumViews).toBe(32);
    expect(snapshots).toHaveLength(count);
});

it("視線と自動ミュートを順序に依存せず確定し、通知時にも矛盾を残さない", () => {
    vi.stubGlobal("window", new EventTarget());
    const settings = SincroAppSettingsModel.getShared();
    const dialog = DialogManager.getManager(settings);
    settings.updateUserMediaAvailabilityStatus(true);
    settings.updateCharacterStatus(true);
    settings.updateSettings({ enableCharacterGaze: false, videoInputDeviceId: "missing" });
    const read = () => ({
        gaze: settings.getSetting("enableCharacterGaze"),
        mute: settings.getSetting("enableAutoMute"),
        disabled: settings.settingsUiState().enableAutoMuteDisabled,
        hint: settings.settingsUiHints().enableAutoMuteReason,
    });
    const notifications = vi.fn(read);
    const unsubscribe = settings.subscribeSettingsChange(notifications);
    const stopUi = dialog.subscribeDialogUiState(() => {
        const state = read();
        expect(state.disabled).toBe(!state.gaze);
        if (!state.gaze) expect(state.mute).toBe(false);
    });
    for (const patch of [
        { enableCharacterGaze: true, enableAutoMute: true },
        { enableAutoMute: true, enableCharacterGaze: true },
    ]) {
        notifications.mockClear();
        settings.updateSettings(patch);
        expect(notifications).toHaveBeenCalledOnce();
        expect(read()).toEqual({ gaze: true, mute: true, disabled: false, hint: undefined });
        settings.updateSettings({ enableCharacterGaze: false, enableAutoMute: true });
        expect(read()).toMatchObject({ gaze: false, mute: false, disabled: true });
        expect(read().hint).toContain("Gaze");
    }
    settings.updateSettings({ enableCharacterGaze: true });
    expect(read()).toMatchObject({ gaze: true, mute: false, disabled: false });
    for (const unavailable of ["media", "page"]) {
        if (unavailable === "media") {
            settings.updateUserMediaAvailabilityStatus(false);
            settings.updateCharacterStatus(true);
        } else {
            settings.updateCharacterStatus(false);
            settings.updateUserMediaAvailabilityStatus(true);
        }
        settings.updateSettings({ enableAutoMute: true, enableCharacterGaze: true });
        expect(read()).toMatchObject({ gaze: false, mute: false, disabled: true });
        expect(settings.settingsUiState().enableCharacterGazeDisabled).toBe(true);
    }
    unsubscribe();
    stopUi();
});

it("ダイアログを生成せず通常設定を適用し、復元と同値編集を区別する", () => {
    const settings = new SincroAppSettingsModel();
    const edited = vi.fn();
    const unsubscribe = settings.subscribeSettingsEdit(edited);
    settings.updateSettings({ titleText: "復元", characterMotionScale: 0.72 }, "restore");
    expect(edited).not.toHaveBeenCalled();
    settings.updateSettings({ titleText: "復元", characterMotionScale: Number.POSITIVE_INFINITY });
    expect(edited).toHaveBeenCalledExactlyOnceWith({ titleText: "復元", characterMotionScale: 0 });
    expect(settings.getSetting("characterMotionScale")).toBe(0);
    unsubscribe();
    settings.updateSettings({ titleText: "解除後" });
    expect(edited).toHaveBeenCalledOnce();
});
