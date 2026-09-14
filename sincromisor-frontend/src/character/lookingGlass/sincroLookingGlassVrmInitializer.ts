import { SincroVRMInitializer } from "../scene/sincroVrmInitializer";
import { LookingGlassVRMScene } from "./lookingGlassVrmScene";

// Looking Glass VRM ページは 360 背景動画を使わず、通常VRMシーン + LG起動導線だけを有効化する。
// 起動前設定の既定値は simple-vrm と揃え、Gaze依存のAutoMute連動も通常どおり使えるようにする。
export class SincroLookingGlassVRMInitializer extends SincroVRMInitializer {
    protected override readonly settingsPage = "looking-glass-vrm";
    // 基底の機器利用可否確認後、購読・OBS開始より前に適用するページ既定値。
    protected override readonly initialSettings = {
        enableCharacter: true,
        enableCharacterGaze: true,
        enableAutoMute: false,
    };

    protected override initializeSincroScene(): LookingGlassVRMScene {
        const vrmScene: LookingGlassVRMScene = new LookingGlassVRMScene({
            diagnostics: this.appController.debug.vrmDiagnostics,
            canvasRoot: this.charCanvas,
            characterControlLayer: this.characterControlLayer,
            vrmUrl: this.appController.dialog.getSelectedVrmUrl(),
            xrMode: true,
            onThumbnailLoaded: (thumbnailImage) => {
                this.updateSystemIconFromThumbnail(thumbnailImage);
            },
        });
        vrmScene.enableLookingGlassStartButton();
        vrmScene.start();
        this.activeScene = vrmScene;
        vrmScene.setSincroPoseRetargetConfig(this.appController.pose.getConfig());
        this.syncSceneRuntimeSettings(this.appController.state.getSettingsSnapshot());
        return vrmScene;
    }
}
