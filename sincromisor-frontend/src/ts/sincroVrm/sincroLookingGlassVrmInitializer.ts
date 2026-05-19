import { LookingGlassVRMScene } from "./lookingGlass/lookingGlassVrmScene";
import { SincroVRMInitializer } from "./sincroVrmInitializer";

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
        const vrmScene: LookingGlassVRMScene = new LookingGlassVRMScene({
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
        this.syncSceneRuntimeSettings(this.appController.state.getSettingsSnapshot());
        return vrmScene;
    }
}
