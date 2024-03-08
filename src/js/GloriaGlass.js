import { GloriaChan } from "./GloriaChan";
import { Color3 } from "@babylonjs/core/Maths/math";
import { LookingGlassWebXRPolyfill } from "@lookingglass/webxr"
import { WebXRExperienceHelper } from "@babylonjs/core/XR/webXRExperienceHelper"
import { EnvironmentHelper } from "@babylonjs/core/Helpers/environmentHelper"

// EnvironmentHelperで必要らしい
import "@babylonjs/core/Materials/Textures/Loaders"
//import "@babylonjs/core/Materials/Node/Blocks"

export class GloriaGlass extends GloriaChan {
  constructor(canvasID) {
    super(canvasID);
  }

  customizeScene() {
    new EnvironmentHelper({
      skyboxSize: 30,
      groundColor: new Color3(0.5, 0.5, 0.5),
    }, this.scene)

    new LookingGlassWebXRPolyfill({
      tileHeight: 512,
      numViews: 45,
      targetX: 0,
      targetY: this.cameraTarget.y,
      targetZ: 0,
      targetDiam: 0.770,
      fovy: (30 * Math.PI) / 180,
      depthiness: 1.0
    });

    //const startLGButton = document.createElement("button");
    //startLGButton.id = "startLG";
    //startLGButton.className = "formButton";
    //startLGButton.textContent = "Looking Glass";
    //document.querySelector("#optionBox").appendChild(startLGButton);
    const startLGButton = document.querySelector("#startLookingGlass");
    startLGButton.addEventListener("click", async () => {
      console.log("start Looking Glass!");
      const xrHelper = await WebXRExperienceHelper.CreateAsync(this.scene);
      const sessionManager = await xrHelper.enterXRAsync("immersive-vr", "local-floor");

      /* メインウインドウのキャラクターは非表示にする */
      this.canvasID.style.display = "none";
      /* メインウインドウのチャットメッセージ幅を、3Dキャラ無し版と同じ幅まで広げる。 */
      //document.querySelector("html").style.setProperty("--chat3DMessageWidth", "60dvw");
      startLGButton.disabled = true;
    });
  }
}
