import { MeshBuilder } from "@babylonjs/core";
import { SincroScene } from "./SincroScene";
import { Color3, Vector3 } from '@babylonjs/core/Maths';
import { WebXRExperienceHelper } from "@babylonjs/core/XR/webXRExperienceHelper";
import { EnvironmentHelper } from "@babylonjs/core/Helpers/environmentHelper";
import { ScenePerformancePriority } from '@babylonjs/core/scene';
// @ts-ignore
import { LookingGlassWebXRPolyfill, LookingGlassConfig } from "@lookingglass/webxr";

// https://docs.lookingglassfactory.com/developer-tools/webxr
export class SincroGlassScene extends SincroScene {
    override customizeScene(): void {
        this.scene.performancePriority = ScenePerformancePriority.BackwardCompatible;

        // 矢印を描画する関数
        const createArrow = (start: Vector3, direction: Vector3, length: number, color: Color3) => {
            // allows, lines
            const arrow = MeshBuilder.CreateLines('env.lines', {
                points: [
                    start,
                    start.add(direction.scale(length))
                ]
            }, this.scene);

            arrow.color = color;
        };

        // 各軸に矢印を作成
        createArrow(new Vector3(0, 0, 0), new Vector3(5, 0, 0), 1, new Color3(1, 0, 0)); // X軸 (赤)
        createArrow(new Vector3(0, 0, 0), new Vector3(0, 5, 0), 1, new Color3(0, 1, 0)); // Y軸 (緑)
        createArrow(new Vector3(0, 0, 0), new Vector3(0, 0, 5), 1, new Color3(0, 0, 1)); // Z軸 (青)


        new EnvironmentHelper({
            //createSkybox: false,
            //createGround: false,
            skyboxSize: 30,
            groundColor: new Color3(0.5, 0.5, 0.5),
        }, this.scene)

        new LookingGlassWebXRPolyfill({
            tileHeight: 512,
            numViews: 45,
            targetX: 0,
            targetY: 1.25,
            targetZ: 0.5,
            targetDiam: 0.85,
            fovy: (25 * Math.PI) / 180,
            depthiness: 1.0,
            //inlineView: 2
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
