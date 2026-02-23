import { LookingGlassVRMScene } from "./LookingGlass/LookingGlassVRMScene";
import { SincroVRMInitializer } from "./SincroVRMInitializer";

// Looking Glass VRM ページは 360 背景動画を使わず、通常VRMシーン + LG起動導線だけを有効化する。
// 起動前設定の既定値は simple-vrm と揃え、Gaze依存のAutoMute連動も通常どおり使えるようにする。
export class SincroLookingGlassVRMInitializer extends SincroVRMInitializer {
    constructor() {
        super();
        this.appController.applySettings({
            enableCharacter: true,
            enableCharacterGaze: true,
            enableAutoMute: false,
        });
    }

    protected override initializeSincroScene(): LookingGlassVRMScene {
        const vrmScene: LookingGlassVRMScene = new LookingGlassVRMScene(
            this.charCanvas,
            this.controlTarget,
            this.appController.dialog.getSelectedVrmUrl(),
            true,
            (thumbnailImage) => {
                this.updateSystemIconFromThumbnail(thumbnailImage);
            },
        );
        vrmScene.enableLookingGlassStartButton();
        vrmScene.start();
        this.activeScene = vrmScene;
        this.syncSceneCharacterVisibility(this.appController.state.getSettingsSnapshot());
        return vrmScene;
    }
}
