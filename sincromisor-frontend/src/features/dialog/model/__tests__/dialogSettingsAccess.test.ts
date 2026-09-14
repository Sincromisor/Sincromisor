import { afterEach, expect, it, vi } from "vitest";
import { applySincroAppSettingsPartial } from "../../../../app/settings/sincroAppSettingsApply";
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
    const dialog = DialogManager.getManager();
    const snapshots: ReturnType<typeof buildSincroAppSettingsSnapshot>[] = [];
    const unsubscribe = dialog.subscribeSettingsChange(() => {
        snapshots.push(buildSincroAppSettingsSnapshot(dialog));
    });

    // 操作不可の項目だけを指定した更新では値も通知も変えない。
    dialog.updateSettings({ enableCharacter: false, enableAutoMute: true });
    expect(dialog.getSetting("enableCharacter")).toBe(true);
    expect(dialog.getSetting("enableAutoMute")).toBe(false);
    expect(snapshots).toHaveLength(0);

    applySincroAppSettingsPartial(dialog, {
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
    expect(dialog.settingsUiHints().audioInputDeviceReason).toContain("見つからない");

    // 起動前ダイアログを閉じても、開始後パネルは同じ適用処理とスナップショットを使う。
    dialog.closeDialog();
    applySincroAppSettingsPartial(dialog, {
        enableVadGate: false,
        enableNoiseSuppression: undefined,
        audioInputDeviceId: undefined,
        videoInputDeviceId: undefined,
        characterMotionScale: -1,
    });
    expect(snapshots).toHaveLength(2);
    expect(buildSincroAppSettingsSnapshot(dialog)).toMatchObject({
        enableVadGate: false,
        enableNoiseSuppression: false,
        audioInputDeviceId: undefined,
        videoInputDeviceId: undefined,
        characterMotionScale: 0,
    });
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(false);
    expect(dialog.settingsUiHints().audioInputDeviceReason).toBeUndefined();
    dialog.showDialog();
    expect(dialog.getSettings().enableVadGate).toBe(false);

    dialog.updateCharacterStatus(true);
    dialog.updateSettings({ videoInputDeviceId: "missing", enableCharacterGaze: false });
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(false);
    dialog.updateSettings({ enableCharacterGaze: true });
    expect(dialog.getDialogUiState().startButtonDisabled).toBe(true);

    const copy = dialog.getSettings();
    copy.enableVadGate = true;
    expect(dialog.getSetting("enableVadGate")).toBe(false);
    unsubscribe();
    const count = snapshots.length;
    applySincroAppSettingsPartial(dialog, { lgNumViews: 32 });
    expect(dialog.getSettings()).not.toHaveProperty("lgNumViews");
    expect(buildSincroAppSettingsSnapshot(dialog).lgNumViews).toBe(32);
    expect(snapshots).toHaveLength(count);
});

it("視線と自動ミュートを順序に依存せず確定し、通知時にも矛盾を残さない", () => {
    vi.stubGlobal("window", new EventTarget());
    const dialog = DialogManager.getManager();
    dialog.updateUserMediaAvailabilityStatus(true);
    dialog.updateCharacterStatus(true);
    dialog.updateSettings({ enableCharacterGaze: false, videoInputDeviceId: "missing" });
    const read = () => ({
        gaze: dialog.getSetting("enableCharacterGaze"),
        mute: dialog.getSetting("enableAutoMute"),
        disabled: dialog.settingsUiState().enableAutoMuteDisabled,
        hint: dialog.settingsUiHints().enableAutoMuteReason,
    });
    const notifications = vi.fn(read);
    const unsubscribe = dialog.subscribeSettingsChange(notifications);
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
        dialog.updateSettings(patch);
        expect(notifications).toHaveBeenCalledOnce();
        expect(read()).toEqual({ gaze: true, mute: true, disabled: false, hint: undefined });
        dialog.updateSettings({ enableCharacterGaze: false, enableAutoMute: true });
        expect(read()).toMatchObject({ gaze: false, mute: false, disabled: true });
        expect(read().hint).toContain("Gaze");
    }
    dialog.updateSettings({ enableCharacterGaze: true });
    expect(read()).toMatchObject({ gaze: true, mute: false, disabled: false });
    for (const unavailable of ["media", "page"]) {
        if (unavailable === "media") {
            dialog.updateUserMediaAvailabilityStatus(false);
            dialog.updateCharacterStatus(true);
        } else {
            dialog.updateCharacterStatus(false);
            dialog.updateUserMediaAvailabilityStatus(true);
        }
        dialog.updateSettings({ enableAutoMute: true, enableCharacterGaze: true });
        expect(read()).toMatchObject({ gaze: false, mute: false, disabled: true });
        expect(dialog.settingsUiState().enableCharacterGazeDisabled).toBe(true);
    }
    unsubscribe();
    stopUi();
});
