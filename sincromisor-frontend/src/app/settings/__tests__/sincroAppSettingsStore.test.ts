import { expect, it, vi } from "vitest";
import { emitSincroAppSettingsRelatedSnapshots } from "../../events/sincroAppEmitHelpers";
import {
    createDefaultSincroAppSettingsSnapshot,
    createDefaultSincroAppSettingsUiState,
    createDefaultSincroAppStartupSettingsStatus,
    defaultSincroAppSettingsUiHints,
} from "../sincroAppSettingsDefaults";
import { SincroAppSettingsStore } from "../sincroAppSettingsStore";

it("初期値の参照を保持し、値・操作可否・案内を一括通知して購読解除できる", () => {
    const initial = {
        settings: createDefaultSincroAppSettingsSnapshot(),
        settingsUiState: createDefaultSincroAppSettingsUiState(),
        settingsUiHints: defaultSincroAppSettingsUiHints,
    };
    const store = new SincroAppSettingsStore(initial);
    expect(store.getSnapshot()).toBe(initial);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    const seen = vi.fn(() => store.getSnapshot());
    const unsubscribe = store.subscribe(seen);
    expect(seen).not.toHaveBeenCalled();
    store.update(structuredClone(initial));
    expect(store.getSnapshot()).toBe(initial);
    expect(seen).not.toHaveBeenCalled();
    const next = {
        settings: { ...initial.settings, titleText: "変更後" },
        settingsUiState: { ...initial.settingsUiState, enableTalkDisabled: true },
        settingsUiHints: { ...initial.settingsUiHints, audioInputDeviceReason: "機器なし" },
    };
    const emit = vi.fn();
    emitSincroAppSettingsRelatedSnapshots(emit, store, {
        ...next,
        startupSettingsStatus: createDefaultSincroAppStartupSettingsStatus(),
    });
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.results[0].value).toEqual(next);
    expect(emit).toHaveBeenCalledWith({ type: "settings_snapshot", settings: next.settings });
    const current = store.getSnapshot();
    store.update(structuredClone(next));
    expect(store.getSnapshot()).toBe(current);
    expect(seen).toHaveBeenCalledOnce();
    unsubscribe();
    store.update(initial);
    expect(seen).toHaveBeenCalledOnce();
});
