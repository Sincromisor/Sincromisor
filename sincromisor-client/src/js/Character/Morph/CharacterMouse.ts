import { Scene } from '@babylonjs/core/scene';
import { Nullable } from '@babylonjs/core/types';
import { AbstractMesh } from '@babylonjs/core/Meshes';
import { MorphTargetManager } from '@babylonjs/core/Morph';
import { TalkManager, CurrentMora } from '../../RTC/TalkManager';

type MouseMorphValues = {
    "Mouse.A": number,
    "Mouse.I": number,
    "Mouse.U": number,
    "Mouse.E": number,
    "Mouse.O": number
}

export class CharacterMouse {
    morphValues: MouseMorphValues;
    talk: TalkManager

    constructor(talk: TalkManager) {
        this.talk = talk;
        this.morphValues = {
            "Mouse.A": 0.0,
            "Mouse.I": 0.0,
            "Mouse.U": 0.0,
            "Mouse.E": 0.0,
            "Mouse.O": 0.0
        }
    }

    private updateMember<T extends object>(obj: T, key: string, value: any): void {
        if (key in obj) {
            (obj as any)[key] = value;
        }
    }

    private updateMouseOpen(vowel: string, value: number): void {
        this.morphValues["Mouse.A"] = 0.0;
        this.morphValues["Mouse.I"] = 0.0;
        this.morphValues["Mouse.U"] = 0.0;
        this.morphValues["Mouse.E"] = 0.0;
        this.morphValues["Mouse.O"] = 0.0;
        this.updateMember(this.morphValues, "Mouse." + vowel, value);
        console.log(this.morphValues);
    }

    setMouse(vowel: string, v_time: number): void {
        console.log([vowel, v_time]);
        this.updateMouseOpen(vowel, 0.5);
        setTimeout(() => {
            this.updateMouseOpen(vowel, 0.8);
        }, 30);
        setTimeout(() => {
            this.updateMouseOpen(vowel, 1.0);
        }, 60);
        setTimeout(() => {
            this.updateMouseOpen(vowel, 0.8);
        }, v_time + 10);
        setTimeout(() => {
            this.updateMouseOpen(vowel, 0.5);
        }, v_time + 30);
        setTimeout(() => {
            this.updateMouseOpen(vowel, 0.0);
        }, v_time + 50);
    }

    // テスト用 
    /*
    private randomMouse(): void {
        const vowel: string = ["A", "I", "U", "E", "O"][Math.floor(Math.random() * (5))];
        const v_time = 500;
        if (Math.random() > 0.999) {
            this.setMouse(vowel, v_time);
        }
    }
    */

    setupMorph(scene: Scene) {
        let currentMoraID: number = -1;
        ["Head_primitive0", "Head_primitive1", "Head_primitive2", "Head_primitive3", "Head_primitive4"].forEach((mName) => {
            let headMesh: Nullable<AbstractMesh> = scene.getMeshByName(mName);
            if (headMesh == null) { return; };
            let morphTargetManager: Nullable<MorphTargetManager> = headMesh.morphTargetManager;
            if (morphTargetManager == null) { return; };
            scene.registerBeforeRender(() => {
                const cMora: CurrentMora | null = this.talk.currentMora();
                if (cMora && cMora.moraID != currentMoraID) {
                    if (cMora.mora.vowel) {
                        this.setMouse(cMora.mora.vowel.toUpperCase(), cMora.msec);
                    }
                    currentMoraID = cMora.moraID;
                }
                //this.randomMouse();
                for (let i = 0; i < morphTargetManager.numTargets; i++) {
                    let target = morphTargetManager.getTarget(i);
                    //target.influence = Math.sin((window.performance.now() / 180) * Math.PI);
                    if (this.morphValues.hasOwnProperty(target.name)) {
                        //console.log([target.name, this.morphValues[target.name as keyof MouseMorphValues]]);
                        target.influence = this.morphValues[target.name as keyof MouseMorphValues];
                    }
                }
            });
        });
    }
}
