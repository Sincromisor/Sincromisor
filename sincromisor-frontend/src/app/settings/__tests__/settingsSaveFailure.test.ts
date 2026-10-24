import { afterEach, expect, it, vi } from "vitest";
import {
    SincroAppSettingsPersistence,
    sincroSettingsStorageKey,
} from "../sincroAppSettingsPersistence";
import { sincroGazeTuningSchema } from "../sincroTrackingTuningSchema";

afterEach(() => vi.unstubAllGlobals());

it("全調整の最新文書を再保存し、初期化で停止した後の再試行は書き込まない", () => {
    const data = new Map<string, string>();
    let writable = false;
    const setItem = vi.fn((key: string, value: string) => {
        if (!writable) throw new DOMException("full", "QuotaExceededError");
        data.set(key, value);
    });
    vi.stubGlobal("window", {
        localStorage: { setItem, getItem: (key: string) => data.get(key) ?? null },
    });
    const saved = new SincroAppSettingsPersistence("simple-vrm");
    const changes: boolean[] = [];
    const unsubscribe = saved.subscribe(() => changes.push(saved.hasUnsavedChanges()));
    saved.save({ titleText: "古い入力" });
    saved.saveAudioTuning({ vadRmsThreshold: 0.05 });
    saved.saveGazeTuning(sincroGazeTuningSchema.parse({ minimumHoldMs: 1250 }));
    saved.savePoseTuning({ smoothingMs: 175 });
    saved.save({ titleText: "最新の入力" });
    expect(saved.hasUnsavedChanges()).toBe(true);
    writable = true;
    saved.retry();
    expect(saved.hasUnsavedChanges()).toBe(false);
    expect(changes[changes.length - 1]).toBe(false);
    const restored = new SincroAppSettingsPersistence("simple-vrm");
    expect(restored.load().titleText).toBe("最新の入力");
    expect(restored.getAudioTuning().vadRmsThreshold).toBe(0.05);
    expect(restored.getGazeTuning()?.minimumHoldMs).toBe(1250);
    expect(restored.getPoseTuning().smoothingMs).toBe(175);
    writable = false;
    saved.save({ titleText: "削除対象" });
    expect(saved.hasUnsavedChanges()).toBe(true);
    SincroAppSettingsPersistence.stopSaving();
    data.delete(sincroSettingsStorageKey("simple-vrm"));
    expect(changes[changes.length - 1]).toBe(false);
    setItem.mockClear();
    writable = true;
    saved.retry();
    saved.save({ titleText: "遅れて到着" });
    expect(setItem).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
    unsubscribe();
});
