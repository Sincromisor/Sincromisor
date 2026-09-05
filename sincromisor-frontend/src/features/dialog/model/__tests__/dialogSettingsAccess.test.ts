import { afterEach, expect, it, vi } from "vitest";
import { applySincroAppSettingsPartial } from "../../../../app/settings/sincroAppSettingsApply";
import { buildSincroAppSettingsSnapshot } from "../../../../app/settings/sincroAppSettingsSnapshotBuilder";
import { DialogManager } from "../dialogManager";

afterEach(() => vi.unstubAllGlobals());

const effects = vi.hoisted(() => ({ title: vi.fn(), talkMode: vi.fn() }));

// ブラウザーとVRM保存だけを置き換え、設定の状態・表示規則・通知は本番実装を通す。
vi.mock("../../../../app/shell/headerTitleDomAdapter", () => ({
    HeaderTitleDomAdapter: class {
        setHeaderTitle = effects.title;
    },
}));
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
    expect(effects.title).toHaveBeenLastCalledWith("Sincromisor");
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
