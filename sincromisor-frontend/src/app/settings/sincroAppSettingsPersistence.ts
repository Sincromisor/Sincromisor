import { z } from "zod";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";
import {
    type SincroAppNumericSettingKey,
    sincroAppNumericSettingConstraints,
} from "./sincroAppSettingsDefaults";
import { type SincroAudioTuning, sincroAudioTuningSchema } from "./sincroAudioTuningSchema";
import { sincroGazeTuningSchema, sincroPoseTuningSchema } from "./sincroTrackingTuningSchema";

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
const documentSchema = z.object({
    version: z.literal(1),
    settings: settingsSchema,
    audio: sincroAudioTuningSchema.optional().catch(undefined),
    gaze: sincroGazeTuningSchema.optional().catch(undefined),
    pose: sincroPoseTuningSchema.optional().catch(undefined),
});

/** 小さなページ別JSONを保持する。初期化・環境通知は書き込まず、利用者操作の差分だけを保存する。 */
export class SincroAppSettingsPersistence {
    private static writesStopped = false;

    /** 全設定初期化後は、既存の通知や古いアプリ参照からの再保存も再読込まで受け付けない。 */
    static stopSaving(): void {
        SincroAppSettingsPersistence.writesStopped = true;
    }

    private gaze?: z.infer<typeof sincroGazeTuningSchema>;
    private pose: z.infer<typeof sincroPoseTuningSchema> = {};
    private audio: SincroAudioTuning = {};
    private settings: z.infer<typeof settingsSchema> = {};
    constructor(private readonly page: SincroSettingsPage) {}

    /** 読み取り失敗は起動を妨げず、共通・ページ既定値へ戻す。 */
    load(): Partial<SincroAppSettingsSnapshot> {
        try {
            const raw = window.localStorage.getItem(sincroSettingsStorageKey(this.page));
            const parsed = documentSchema.safeParse(raw === null ? undefined : JSON.parse(raw));
            this.settings = parsed.success ? parsed.data.settings : {};
            this.audio = parsed.success ? (parsed.data.audio ?? {}) : {};
            this.gaze = parsed.success ? parsed.data.gaze : undefined;
            this.pose = parsed.success ? (parsed.data.pose ?? {}) : {};
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
        if (SincroAppSettingsPersistence.writesStopped) return;
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
        this.write();
    }

    /** 通常設定の復元後に音声コールバックから使用する。診断通知のスナップショットは保存しない。 */
    getAudioTuning(): SincroAudioTuning {
        return this.audio;
    }

    saveAudioTuning(partial: SincroAudioTuning): void {
        if (SincroAppSettingsPersistence.writesStopped) return;
        this.audio = { ...this.audio, ...sincroAudioTuningSchema.parse(partial) };
        this.write();
    }

    /** 会場プリセットの明示切替では、そのプリセットが所有する個別調整だけを解除する。 */
    clearVenueAudioTuning(): void {
        delete this.audio.filterConfig;
        delete this.audio.vadRmsThreshold;
        delete this.audio.peakThreshold;
        this.write();
    }

    /** シーン生成前でも診断モデルへ適用できる、検証済みの視線・姿勢調整を返す。 */
    getGazeTuning() {
        return this.gaze;
    }

    getPoseTuning(): z.infer<typeof sincroPoseTuningSchema> {
        return Object.fromEntries(
            Object.entries(this.pose).filter(([, value]) => value !== undefined),
        );
    }

    saveGazeTuning(config: z.infer<typeof sincroGazeTuningSchema>): void {
        if (SincroAppSettingsPersistence.writesStopped) return;
        this.gaze = sincroGazeTuningSchema.parse(config);
        this.write();
    }

    /** 入力された項目だけを保存し、他の診断操作で通常設定の強度を複製しない。 */
    savePoseTuning(partial: z.infer<typeof sincroPoseTuningSchema>): void {
        if (SincroAppSettingsPersistence.writesStopped) return;
        const valid = sincroPoseTuningSchema.parse(partial);
        Object.assign(
            this.pose,
            Object.fromEntries(Object.entries(valid).filter(([, value]) => value !== undefined)),
        );
        this.write();
    }

    clearPoseIntensity(): void {
        delete this.pose.intensityScale;
        this.write();
    }

    private write(): void {
        if (SincroAppSettingsPersistence.writesStopped) return;
        try {
            window.localStorage.setItem(
                sincroSettingsStorageKey(this.page),
                JSON.stringify({
                    version: 1,
                    settings: this.settings,
                    audio: this.audio,
                    gaze: this.gaze,
                    pose: this.pose,
                }),
            );
        } catch (error) {
            frontendLogger.warn("Failed to save settings.", { error });
        }
    }
}
