import { z } from "zod";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";
import {
    type SincroAppNumericSettingKey,
    sincroAppNumericSettingConstraints,
} from "./sincroAppSettingsDefaults";

/** URL表記に依存しない、共通枠組みを使うページの保存単位。 */
export type SincroSettingsPage = "simple-vrm" | "vrm360" | "looking-glass-vrm";
export const sincroSettingsPages: readonly SincroSettingsPage[] = [
    "simple-vrm",
    "vrm360",
    "looking-glass-vrm",
];

/** 形式の版はJSON内に置き、初期化時は未対応形式も同じ所有キーで削除する。 */
export function sincroSettingsStorageKey(page: SincroSettingsPage): string {
    return `sincromisor:settings:${page}`;
}

// 項目ごとに不正値を捨て、残りの利用者設定を活用する。刻みは入力用であり保存値は丸めない。
const flag = z.boolean().optional().catch(undefined);
function numeric(key: SincroAppNumericSettingKey) {
    const { min, max, step } = sincroAppNumericSettingConstraints[key];
    const schema = z.number().min(min).max(max);
    return (step === 1 ? schema.int() : schema).optional().catch(undefined);
}
const settingsSchema = z.object({
    talkMode: z.enum(["chat", "sincro"]).optional().catch(undefined),
    titleText: z.string().optional().catch(undefined),
    audioInputDeviceId: z.string().nullable().optional().catch(undefined),
    videoInputDeviceId: z.string().nullable().optional().catch(undefined),
    enableCharacter: flag,
    enableCharacterGaze: flag,
    enableSincroPoseTracking: flag,
    forceSincroPoseTracking: flag,
    enableAutoMute: flag,
    enableNoiseSuppression: flag,
    enableEchoCancellation: flag,
    enableAutoGainControl: flag,
    enableVadGate: flag,
    enableVenueNoiseMode: flag,
    characterMotionScale: numeric("characterMotionScale"),
    sincroPoseRetargetScale: numeric("sincroPoseRetargetScale"),
    characterEyeTrackingScale: numeric("characterEyeTrackingScale"),
    lgTileHeight: numeric("lgTileHeight"),
    lgNumViews: numeric("lgNumViews"),
    lgTargetY: numeric("lgTargetY"),
    lgTargetZ: numeric("lgTargetZ"),
    lgTargetDiam: numeric("lgTargetDiam"),
    lgDepthiness: numeric("lgDepthiness"),
    lgFovyDeg: numeric("lgFovyDeg"),
});
const documentSchema = z.object({ version: z.literal(1), settings: settingsSchema });

/** 小さなページ別JSONを保持する。初期化・環境通知は書き込まず、利用者操作の差分だけを保存する。 */
export class SincroAppSettingsPersistence {
    private settings: z.infer<typeof settingsSchema> = {};
    constructor(private readonly page: SincroSettingsPage) {}

    /** 読み取り失敗は起動を妨げず、共通・ページ既定値へ戻す。 */
    load(): Partial<SincroAppSettingsSnapshot> {
        try {
            const raw = window.localStorage.getItem(sincroSettingsStorageKey(this.page));
            const parsed = documentSchema.safeParse(raw === null ? undefined : JSON.parse(raw));
            this.settings = parsed.success ? parsed.data.settings : {};
        } catch (error) {
            frontendLogger.warn("Failed to load settings.", { error });
        }
        // 未指定とブラウザー既定への明示復帰を区別するため、保存形式だけnullを使う。
        const { audioInputDeviceId, videoInputDeviceId, ...remaining } = this.settings;
        return {
            ...Object.fromEntries(
                Object.entries(remaining).filter(([, value]) => value !== undefined),
            ),
            ...(audioInputDeviceId !== undefined
                ? { audioInputDeviceId: audioInputDeviceId ?? undefined }
                : {}),
            ...(videoInputDeviceId !== undefined
                ? { videoInputDeviceId: videoInputDeviceId ?? undefined }
                : {}),
        };
    }

    /** 適用済みの利用者入力だけをマージする。保存できなくても現在の設定は使い続ける。 */
    save(partial: Partial<SincroAppSettingsSnapshot>): void {
        const encoded = {
            ...partial,
            ...("audioInputDeviceId" in partial
                ? { audioInputDeviceId: partial.audioInputDeviceId ?? null }
                : {}),
            ...("videoInputDeviceId" in partial
                ? { videoInputDeviceId: partial.videoInputDeviceId ?? null }
                : {}),
        };
        const valid = settingsSchema.parse(encoded);
        Object.assign(
            this.settings,
            Object.fromEntries(Object.entries(valid).filter(([, value]) => value !== undefined)),
        );
        try {
            window.localStorage.setItem(
                sincroSettingsStorageKey(this.page),
                JSON.stringify({ version: 1, settings: this.settings }),
            );
        } catch (error) {
            frontendLogger.warn("Failed to save settings.", { error });
        }
    }
}
