import { SincroVRMInitializer } from "./SincroVRMInitializer";
import { VRM360Scene } from "./VRM360/VRM360Scene";

// VRM1.0 + 360動画背景ページの initializer。
// 基本フローは SincroVRMInitializer を再利用し、360 向け差分だけを override する。
export class SincroVRM360Initializer extends SincroVRMInitializer {
    constructor() {
        super();
        // 360deg camera ページでは顔向き推定の意味が薄く負荷も増えるため、Gaze は既定でOFFにする。
        // Character 本体は既定ONのままにして、見た目の初期体験を維持する。
        this.appController.applySettings({
            enableCharacter: true,
            enableCharacterGaze: false,
            enableAutoMute: false,
        });
    }

    protected override initializeSincroScene(): VRM360Scene {
        // 360 ページも VRM サムネイル生成/保存フローは base と同じ callback を使う。
        const vrmScene: VRM360Scene = new VRM360Scene(this.charCanvas, this.controlTarget, this.appController.dialog.getSelectedVrmUrl(), true, (thumbnailImage) => {
            this.updateSystemIconFromThumbnail(thumbnailImage);
        });
        // VRM1.0系から Looking Glass を起動する入口。Babylon legacy を経由しない。
        vrmScene.enableLookingGlassStartButton();
        vrmScene.start();
        return vrmScene;
        /*
            this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        */
    }
}
