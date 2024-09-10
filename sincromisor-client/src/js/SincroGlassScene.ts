import { SincroScene } from "./SincroScene";
import { Color3 } from '@babylonjs/core/Maths';
import { WebXRExperienceHelper } from "@babylonjs/core/XR/webXRExperienceHelper";
import { EnvironmentHelper } from "@babylonjs/core/Helpers/environmentHelper";
// @ts-ignore
import { LookingGlassWebXRPolyfill } from "@lookingglass/webxr";

// https://docs.lookingglassfactory.com/developer-tools/webxr
export class SincroGlassScene extends SincroScene {
    customizeScehe(): void {
        new EnvironmentHelper({
            skyboxSize: 30,
            groundColor: new Color3(0.5, 0.5, 0.5),
        }, this.scene)

        new LookingGlassWebXRPolyfill({
            tileHeight: 512,
            numViews: 45,
            targetX: 0,
            targetY: 1.5,
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
        const startLGButton: HTMLButtonElement | null = document.querySelector("button#startLookingGlass");
        if (!startLGButton) {
            throw 'button#startLookingGlass is not found.';
        }
        startLGButton.addEventListener("click", async () => {
            console.log("start Looking Glass!");
            const xrHelper = await WebXRExperienceHelper.CreateAsync(this.scene);
            await xrHelper.enterXRAsync("immersive-vr", "local-floor");

            /* メインウインドウのキャラクターは非表示にする */
            this.canvas.style.display = "none";
            /* メインウインドウのチャットメッセージ幅を、3Dキャラ無し版と同じ幅まで広げる。 */
            //document.querySelector("html").style.setProperty("--chat3DMessageWidth", "60dvw");
            startLGButton.disabled = true;
        });

    }
}
