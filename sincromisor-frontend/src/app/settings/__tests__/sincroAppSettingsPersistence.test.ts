import { afterEach, expect, it, vi } from "vitest";
import { SincroAppController } from "../../controller/sincroAppController";
import { SincroAppSettingsModel } from "../../settings/sincroAppSettingsModel";
import {
    SincroAppSettingsPersistence,
    sincroSettingsStorageKey,
} from "../sincroAppSettingsPersistence";

vi.mock("../../controller/sincroController", () => ({
    SincroController: class {
        restoreAudioTuning() {}
        start() {}
    },
}));
afterEach(() => {
    SincroAppController.getCurrent()?.releaseEventSubscriptions();
    vi.unstubAllGlobals();
});

function storage() {
    const data = new Map<string, string>();
    const localStorage = {
        getItem: vi.fn((key: string) => data.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            data.set(key, value);
        }),
    };
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage }));
    vi.stubGlobal("document", { querySelector: () => ({}) });
    return localStorage;
}

it("保存値を項目別に検証し、精度・機器既定・ページ分離を保って読み戻す", () => {
    const local = storage();
    const saved = new SincroAppSettingsPersistence("simple-vrm");
    saved.save({
        characterMotionScale: 0.72,
        sincroPoseRetargetScale: 0.68,
        audioInputDeviceId: undefined,
        titleText: "保存",
        enableTalk: false,
    });
    expect(new SincroAppSettingsPersistence("simple-vrm").load()).toEqual({
        characterMotionScale: 0.72,
        sincroPoseRetargetScale: 0.68,
        audioInputDeviceId: undefined,
        titleText: "保存",
    });
    expect(new SincroAppSettingsPersistence("vrm360").load()).toEqual({});
    local.setItem(
        sincroSettingsStorageKey("simple-vrm"),
        JSON.stringify({
            version: 1,
            settings: {
                titleText: "有効",
                talkMode: "bad",
                enableCharacter: "yes",
                lgNumViews: 10.5,
                characterMotionScale: 4,
            },
        }),
    );
    expect(saved.load()).toEqual({ titleText: "有効" });
    for (const raw of ["{", '{"version":2,"settings":{"titleText":"未対応"}}', "null"]) {
        local.setItem(sincroSettingsStorageKey("simple-vrm"), raw);
        expect(new SincroAppSettingsPersistence("simple-vrm").load()).toEqual({});
    }
    local.getItem.mockImplementation(() => {
        throw new Error("denied");
    });
    local.setItem.mockImplementation(() => {
        throw new Error("full");
    });
    expect(new SincroAppSettingsPersistence("simple-vrm").load()).toEqual({});
    expect(() => saved.save({ titleText: "保存失敗" })).not.toThrow();
});

it("復元と利用不可通知では保存せず、利用者変更・URL優先・直接のプリセット解除を保存する", () => {
    const local = storage();
    const saved = new SincroAppSettingsPersistence("simple-vrm");
    saved.save({
        talkMode: "sincro",
        enableCharacterGaze: true,
        characterMotionScale: 0.72,
        sincroPoseRetargetScale: 0.68,
        audioInputDeviceId: "missing",
        enableVenueNoiseMode: true,
    });
    local.setItem.mockClear();
    const app = new SincroAppController();
    app.dialog.updateCharacterAvailabilityStatus(true);
    app.restoreSettings("simple-vrm", { talkMode: "chat" }, { talkMode: "chat" });
    expect(app.getSettingsSnapshot()).toMatchObject({
        talkMode: "chat",
        characterMotionScale: 0.72,
        sincroPoseRetargetScale: 0.68,
        audioInputDeviceId: "missing",
    });
    app.dialog.updateUserMediaAvailabilityStatus(false);
    expect(local.setItem).not.toHaveBeenCalled();
    expect(saved.load()).toMatchObject({
        talkMode: "sincro",
        enableCharacterGaze: true,
        audioInputDeviceId: "missing",
    });
    app.applySettings({ titleText: "編集", audioInputDeviceId: undefined });
    SincroAppSettingsModel.getShared().updateSettings({ enableVenueNoiseMode: false });
    expect(saved.load()).toMatchObject({
        titleText: "編集",
        talkMode: "sincro",
        enableVenueNoiseMode: false,
        enableCharacterGaze: true,
        audioInputDeviceId: undefined,
    });
    app.applySettings({ lgTargetY: 1.35 });
    expect(saved.load().lgTargetY).toBe(1.35);
});

it("視線・姿勢の不正項目と観測値を除外し、通常強度とラジアン精度を保つ", () => {
    const local = storage();
    const angle = (34 * Math.PI) / 180;
    local.setItem(
        sincroSettingsStorageKey("simple-vrm"),
        JSON.stringify({
            version: 1,
            settings: { sincroPoseRetargetScale: 0.68 },
            gaze: { minimumHoldMs: 1250, deadband: -1, oneEuroDCutoff: 1.25, faceX: 0.2 },
            pose: {
                intensityScale: "bad",
                smoothingMs: 175,
                armIkMaxLiftRad: angle,
                armIkMode: "invalid",
                torsoLeanRad: 1,
                avatarMotionProfile: {},
            },
        }),
    );
    const saved = new SincroAppSettingsPersistence("simple-vrm");
    expect(saved.load().sincroPoseRetargetScale).toBe(0.68);
    expect(saved.getPoseTuning()).toEqual({ smoothingMs: 175, armIkMaxLiftRad: angle });
    expect(saved.getGazeTuning()).toMatchObject({
        minimumHoldMs: 1250,
        oneEuroDCutoff: 1.25,
        deadband: 0.0025,
    });
    expect(saved.getGazeTuning()).not.toHaveProperty("faceX");
    saved.save({ titleText: "通常設定変更" });
    const restored = new SincroAppSettingsPersistence("simple-vrm");
    restored.load();
    expect(restored.getPoseTuning()).toEqual(saved.getPoseTuning());
    expect(restored.getGazeTuning()).toEqual(saved.getGazeTuning());
});
