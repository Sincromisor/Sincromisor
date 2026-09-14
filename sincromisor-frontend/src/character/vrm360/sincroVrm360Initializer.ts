import { SincroVRMInitializer } from "../scene/sincroVrmInitializer";
import { VRM360Scene } from "./vrm360Scene";

// VRM1.0 + 360動画背景ページの initializer。
// 基本フローは SincroVRMInitializer を再利用し、360 向け差分だけを override する。
export class SincroVRM360Initializer extends SincroVRMInitializer {
    // 基底の機器利用可否確認後、購読・OBS開始より前に適用するページ既定値。
    protected override readonly initialSettings = {
        enableCharacter: true,
        enableCharacterGaze: false,
        enableAutoMute: false,
    };

    protected override initializeSincroScene(): VRM360Scene {
        // 360 ページも VRM サムネイル生成/保存フローは base と同じ callback を使う。
        const vrmScene: VRM360Scene = new VRM360Scene({
            diagnostics: this.appController.debug.vrmDiagnostics,
            canvasRoot: this.charCanvas,
            characterControlLayer: this.characterControlLayer,
            vrmUrl: this.appController.dialog.getSelectedVrmUrl(),
            xrMode: true,
            onThumbnailLoaded: (thumbnailImage) => {
                this.updateSystemIconFromThumbnail(thumbnailImage);
            },
        });
        // VRM1.0系から Looking Glass を起動する入口。Babylon legacy を経由しない。
        vrmScene.enableLookingGlassStartButton();
        vrmScene.start();
        this.activeScene = vrmScene;
        vrmScene.setSincroPoseRetargetConfig(this.appController.pose.getConfig());
        this.syncSceneRuntimeSettings(this.appController.state.getSettingsSnapshot());
        return vrmScene;
    }
}
