import type { MinimalAvatarMotionProfile } from "../../../character/avatarProfile/minimalAvatarMotionProfile";
import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../../../character/retargeting/sincroPoseRetargeter";
import type {
    SincroMotionComposerDryRunSummary,
    SincroMotionObserveOnlySummary,
} from "../../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { SincroPoseTuningConfig } from "../../../character/runtime/sincroPoseSettingsModel";
import type { SincroVrmPoseComposerResult } from "../../../character/runtime/sincroVrmPoseComposer";
import type { SincroFaceMotionSnapshot } from "../../gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../gaze/trackingRuntime/sincroTrackerWorkerTypes";
import {
    cloneSincroFaceMotionSnapshot,
    cloneSincroPoseMotionSnapshot,
} from "./debugConsoleMotionSnapshot";
import {
    cloneAvatarMotionProfile,
    cloneComposerDryRun,
    cloneObserveOnlySummary,
    clonePoseRetargetRuntime,
} from "./debugConsoleSincroMotionRuntime";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type DebugConsoleSincroMotionControlsParams = {
    updateSnapshot: (updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot) => void;
};

// Sincro motion 関連 snapshot の更新を一箇所に集める。
// face / pose / retarget runtime の深いコピー規則を manager から隠すための責務分割。
export class DebugConsoleSincroMotionControls {
    private onSincroPoseRetargetConfigEdit?: (
        config: Partial<SincroPoseRetargetConfig>,
        source: "user" | "sync",
    ) => void;

    constructor(private readonly params: DebugConsoleSincroMotionControlsParams) {}

    updateSincroFaceMotion(snapshot: SincroFaceMotionSnapshot): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                face: cloneSincroFaceMotionSnapshot(snapshot),
            },
        }));
    }

    updateSincroPoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                pose: cloneSincroPoseMotionSnapshot(snapshot),
            },
        }));
    }

    updateSincroTrackerStats(snapshot: SincroTrackerWorkerStats): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                tracker: { ...snapshot },
            },
        }));
    }

    updateSincroObserveOnlySummary(summary: SincroMotionObserveOnlySummary): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                observeOnly: cloneObserveOnlySummary(summary),
            },
        }));
    }

    updateSincroComposerDryRunSummary(summary: SincroMotionComposerDryRunSummary): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                observeOnly: {
                    ...currentSnapshot.sincroMotion.observeOnly,
                    composerDryRun: {
                        status: summary.status,
                        warnings: [...summary.warnings],
                        suppressedLayers: [...summary.suppressedLayers],
                        clampedBones: [...summary.clampedBones],
                        fullNormalizedPoseApplication:
                            summary.fullNormalizedPoseApplication === undefined
                                ? undefined
                                : { ...summary.fullNormalizedPoseApplication },
                    },
                },
            },
        }));
    }

    /** 管理側で適用結果を付与した本番合成結果を、既存の診断・保存キーへ複製する。 */
    updateSincroComposerDryRunResult(result: SincroVrmPoseComposerResult): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                poseRetargetRuntime: {
                    ...currentSnapshot.sincroMotion.poseRetargetRuntime,
                    composerDryRun: cloneComposerDryRun(result),
                },
            },
        }));
    }

    updateSincroPoseRetargetFrame(frame: SincroPoseRetargetFrame): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                poseRetargetRuntime: clonePoseRetargetRuntime(
                    frame,
                    currentSnapshot.sincroMotion.poseRetargetRuntime.avatarMotionProfile,
                    currentSnapshot.sincroMotion.poseRetargetRuntime.composerDryRun,
                ),
            },
        }));
    }

    updateAvatarMotionProfile(profile: MinimalAvatarMotionProfile | undefined): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                poseRetargetRuntime: {
                    ...currentSnapshot.sincroMotion.poseRetargetRuntime,
                    avatarMotionProfile: cloneAvatarMotionProfile(profile),
                    composerDryRun: currentSnapshot.sincroMotion.poseRetargetRuntime.composerDryRun,
                },
            },
        }));
    }

    /** 所有モデルから受け取った正規化済み設定を表示用に複製する。操作通知と保存は発生させない。 */
    setSincroPoseRetargetConfig(config: SincroPoseTuningConfig): void {
        this.params.updateSnapshot((snapshot) => ({
            ...snapshot,
            sincroMotion: { ...snapshot.sincroMotion, poseRetarget: { ...config } },
        }));
    }

    /** 診断操作を現在の所有者へ渡す。古い解除を再実行しても新しい登録は消さない。 */
    setSincroPoseRetargetConfigEditCallback(
        callback: (config: Partial<SincroPoseRetargetConfig>, source: "user" | "sync") => void,
    ): () => void {
        const notify = (config: Partial<SincroPoseRetargetConfig>, source: "user" | "sync") =>
            callback(config, source);
        this.onSincroPoseRetargetConfigEdit = notify;
        return () => {
            if (this.onSincroPoseRetargetConfigEdit === notify)
                this.onSincroPoseRetargetConfigEdit = undefined;
        };
    }

    /** 入力を所有者へ渡す。正規化と保存判断は接続先が行い、未接続なら表示値も変更しない。 */
    applySincroPoseRetargetConfig(
        config: Partial<SincroPoseRetargetConfig>,
        source: "user" | "sync" = "user",
    ): void {
        this.onSincroPoseRetargetConfigEdit?.(config, source);
    }
}
