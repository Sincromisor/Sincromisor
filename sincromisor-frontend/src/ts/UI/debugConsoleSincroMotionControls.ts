import type { SincroFaceMotionSnapshot } from "../FaceTracking/SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../FaceTracking/SincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../FaceTracking/SincroTrackerWorkerTypes";
import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../SincroVRM/VRMCharacter/SincroPoseRetargeter";
import {
    cloneSincroFaceMotionSnapshot,
    cloneSincroPoseMotionSnapshot,
} from "./debugConsoleMotionSnapshot";
import {
    clonePoseRetargetRuntime,
    updatePoseRetargetConfig,
} from "./debugConsoleSincroMotionRuntime";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type DebugConsoleSincroMotionControlsParams = {
    readSnapshot: () => DebugConsoleSnapshot;
    updateSnapshot: (updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot) => void;
};

// Sincro motion 関連 snapshot の更新を一箇所に集める。
// face / pose / retarget runtime の深いコピー規則を manager から隠すための責務分割。
export class DebugConsoleSincroMotionControls {
    private onSincroPoseRetargetConfigChange: (config: Partial<SincroPoseRetargetConfig>) => void =
        () => {};

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

    updateSincroPoseRetargetFrame(frame: SincroPoseRetargetFrame): void {
        this.params.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                poseRetargetRuntime: clonePoseRetargetRuntime(frame),
            },
        }));
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.params.updateSnapshot((snapshot) => ({
            ...snapshot,
            sincroMotion: {
                ...snapshot.sincroMotion,
                poseRetarget: updatePoseRetargetConfig(snapshot.sincroMotion.poseRetarget, config),
            },
        }));
    }

    setSincroPoseRetargetConfigChangeCallback(
        callback: (config: Partial<SincroPoseRetargetConfig>) => void,
    ): void {
        this.onSincroPoseRetargetConfigChange = callback;
    }

    applySincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.setSincroPoseRetargetConfig(config);
        this.onSincroPoseRetargetConfigChange(this.params.readSnapshot().sincroMotion.poseRetarget);
    }
}
