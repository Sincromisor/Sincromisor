import { Scene } from '@babylonjs/core/scene';
import { Nullable } from '@babylonjs/core/types';
import { AbstractMesh } from '@babylonjs/core/Meshes';
import { MorphTargetManager } from '@babylonjs/core/Morph';

type MayuMorphValues = {
    "Mayu.l": number, // 左上瞼
    "Mayu.r": number, // 右上瞼
}

export class MayuMorph {
    private readonly morphValues: MayuMorphValues;

    constructor() {
        this.morphValues = {
            "Mayu.l": 0.0,
            "Mayu.r": 0.0,
        }
    }

    updateMayu(value: number): void {
        this.morphValues["Mayu.l"] = value;
        this.morphValues["Mayu.r"] = value;
    }

    setupMorph(scene: Scene): void {
        ["Head_primitive0", "Head_primitive1", "Head_primitive2", "Head_primitive3", "Head_primitive4"].forEach((mName) => {
            let headMesh: Nullable<AbstractMesh> = scene.getMeshByName(mName);
            if (headMesh == null) { return; };
            let morphTargetManager: Nullable<MorphTargetManager> = headMesh.morphTargetManager;
            if (morphTargetManager == null) { return; };

            scene.registerBeforeRender(() => {
                // this.updateMabataki();
                //this.randomMouse();
                for (let i = 0; i < morphTargetManager.numTargets; i++) {
                    let target = morphTargetManager.getTarget(i);
                    //target.influence = Math.sin((window.performance.now() / 180) * Math.PI);
                    if (this.morphValues.hasOwnProperty(target.name)) {
                        target.influence = this.morphValues[target.name as keyof MayuMorphValues];
                    }
                }
            });
        });
    }
}
