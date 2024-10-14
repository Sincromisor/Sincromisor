import { Scene } from '@babylonjs/core/scene';
import { Nullable } from '@babylonjs/core/types';
import { AbstractMesh } from '@babylonjs/core/Meshes';
import { MorphTarget, MorphTargetManager } from '@babylonjs/core/Morph';

type BodyMorphValues = {
    "rig": number
}

export class BodyMorph {
    private readonly morphValues: BodyMorphValues;

    constructor() {
        this.morphValues = {
            "rig": 0.0,
        }
    }

    updateBody(value: number) {
        this.morphValues["rig"] = value;
    }

    setupMorph(scene: Scene): void {
        let bodyMesh: Nullable<AbstractMesh> = scene.getMeshByName("Body");
        if (bodyMesh == null) {
            console.error('Mesh "Body" is not found.');
            return;
        }
        let morphTargetManager: Nullable<MorphTargetManager> = bodyMesh.morphTargetManager;
        if (morphTargetManager == null) {
            console.error('morphTargetManager in null.')
            return;
        }
        const freq: number = 15; // 大きくなればなるほど揺れる頻度が下がる

        scene.registerBeforeRender(() => {
            let target: MorphTarget = morphTargetManager.getTarget(0);
            target.influence = 0.9 + Math.sin((window.performance.now() / freq / 180) * Math.PI) / 100;
        });
    }
}
