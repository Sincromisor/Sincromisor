/**
 * motion-debug の VRM scene、retarget config、render loop、snapshot 取得を所有する lifecycle module。
 * camera / tracker source は受け取るだけで、MediaStream や Worker lifecycle は扱わない。
 */
import type { SincroPoseRetargetConfig } from "../../character/retargeting/sincroPoseRetargeter";
import { VRMScene } from "../../character/scene/vrmScene";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { MotionDebugFrameCapture } from "./motionDebugFrameCapture";
import type { MotionDebugPoseOverlayRenderer } from "./poseOverlayRenderer";
import type { MotionDebugRenderMetrics, MotionDebugRetargetUiConfig } from "./types";

const SNAPSHOT_RENDER_INTERVAL_MS = 180;

type MotionDebugSceneRuntimeParams = {
    characterRoot: HTMLDivElement;
    characterControlLayer: HTMLDivElement;
    vrmUrl: string;
    initialRetargetConfig: MotionDebugRetargetUiConfig;
    video: HTMLVideoElement;
    overlayRenderer: MotionDebugPoseOverlayRenderer;
    getLatestPoseSnapshot: () => SincroPoseMotionSnapshot;
    renderSnapshot: () => void;
};

export class MotionDebugSceneRuntime {
    private readonly scene: VRMScene;
    private lastSnapshotRenderedAtMs = 0;
    private renderFps = 0;
    private renderFrames = 0;
    private renderFpsStartedAtMs = performance.now();

    constructor(private readonly params: MotionDebugSceneRuntimeParams) {
        this.scene = new VRMScene({
            canvasRoot: params.characterRoot,
            characterControlLayer: params.characterControlLayer,
            vrmUrl: params.vrmUrl,
            xrMode: false,
        });
        this.scene.start();
        this.scene.setSincroPoseRetargetConfig(params.initialRetargetConfig);
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.scene.setSincroPoseRetargetConfig(config);
    }

    renderOnce(mediaTimeMs: number): void {
        this.scene.renderOnce(mediaTimeMs);
    }

    getAvatarMotionProfile(): ReturnType<VRMScene["getAvatarMotionProfile"]> {
        return this.scene.getAvatarMotionProfile();
    }

    startRenderLoop(): void {
        window.requestAnimationFrame(() => {
            this.startRenderLoop();
            this.updateRenderFps();
            this.params.overlayRenderer.render(
                this.params.getLatestPoseSnapshot(),
                this.params.video,
            );
            if (performance.now() - this.lastSnapshotRenderedAtMs >= SNAPSHOT_RENDER_INTERVAL_MS) {
                this.params.renderSnapshot();
            }
        });
    }

    markSnapshotRendered(): void {
        this.lastSnapshotRenderedAtMs = performance.now();
    }

    renderMetrics(frameCapture: MotionDebugFrameCapture): MotionDebugRenderMetrics {
        return {
            renderFps: this.renderFps,
            lastFrameCapturedAtMs: frameCapture.lastFrameCapturedAtMs(),
        };
    }

    private updateRenderFps(): void {
        this.renderFrames += 1;
        const nowMs = performance.now();
        const elapsedMs = nowMs - this.renderFpsStartedAtMs;
        if (elapsedMs < 500) {
            return;
        }
        this.renderFps = (this.renderFrames * 1000) / elapsedMs;
        this.renderFrames = 0;
        this.renderFpsStartedAtMs = nowMs;
    }
}
