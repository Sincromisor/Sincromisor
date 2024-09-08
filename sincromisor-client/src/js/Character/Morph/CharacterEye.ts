import { Scene } from '@babylonjs/core/scene';
import { Nullable } from '@babylonjs/core/types';
import { AbstractMesh } from '@babylonjs/core/Meshes';
import { MorphTargetManager } from '@babylonjs/core/Morph';

type EyeMorphValues = {
    "EyeU.l": number, // 左上瞼
    "EyeU.r": number, // 右上瞼
    "EyeD.l": number, // 左下瞼
    "EyeD.r": number  // 右下瞼
}

export class CharacterEye {
    morphValues: EyeMorphValues;

    constructor() {
        this.morphValues = {
            "EyeU.l": 0.0,
            "EyeU.r": 0.0,
            "EyeD.l": 0.0,
            "EyeD.r": 0.0
        }
    }

    updateEyeClose(value: number): void {
        this.morphValues["EyeU.l"] = value;
        this.morphValues["EyeU.r"] = value;
        this.morphValues["EyeD.l"] = value;
        this.morphValues["EyeD.r"] = value;
    }

    private updateMabataki(): void {
        if (Math.random() > 0.9999) {
            this.updateEyeClose(0.3);
            setTimeout(() => {
                this.updateEyeClose(0.6);
            }, 30);
            setTimeout(() => {
                this.updateEyeClose(1.0);
            }, 60);
            setTimeout(() => {
                this.updateEyeClose(0.6);
            }, 90);
            setTimeout(() => {
                this.updateEyeClose(0.3);
            }, 120);
            setTimeout(() => {
                this.updateEyeClose(0.0);
            }, 150);
        } else {
            // たまに目を閉じる
            //if (Math.random() > 0.99995) {
            //    this.updateEyeClose(1.0);
            //};
        }
    }

    setupMorph(scene: Scene): void {
        ["Head_primitive0", "Head_primitive1", "Head_primitive2", "Head_primitive3", "Head_primitive4"].forEach((mName) => {
            let headMesh: Nullable<AbstractMesh> = scene.getMeshByName(mName);
            if (headMesh == null) { return; };
            let morphTargetManager: Nullable<MorphTargetManager> = headMesh.morphTargetManager;
            if (morphTargetManager == null) { return; };

            /* 首が微妙にズレて隙間が空く問題を修正 */
            headMesh.position.x = -0.00155;  // 左右(マイナスで左に)
            headMesh.position.y = -0.00085; // 高さ(マイナスで低く)
            headMesh.position.z = -0.0001; // 前後(マイナスで前に)

            scene.registerBeforeRender(() => {
                this.updateMabataki();
                //this.randomMouse();
                for (let i = 0; i < morphTargetManager.numTargets; i++) {
                    let target = morphTargetManager.getTarget(i);
                    //target.influence = Math.sin((window.performance.now() / 180) * Math.PI);
                    if (this.morphValues.hasOwnProperty(target.name)) {
                        target.influence = this.morphValues[target.name as keyof EyeMorphValues];
                    }
                }
            });
        });
    }
}
