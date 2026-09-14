import type { Object3D } from "three/src/core/Object3D.js";
import type { Euler } from "three/src/math/Euler.js";
import type { Vector3 } from "three/src/math/Vector3.js";

/** VRM内部更新後に腰だけを復元し、上半身の最終姿勢適用とは独立に配置を保つ。 */
export class CharacterRootStabilizer {
    private readonly baseRotation: Euler | undefined;

    /** 正規化済み腰ボーンの読込時回転を保存する。欠損モデルでは更新を行わない。 */
    constructor(private readonly hips: Object3D | undefined) {
        this.baseRotation = hips?.rotation.clone();
    }

    /** 親座標系の基準位置と読込時回転へ戻す。上半身ボーンは変更しない。 */
    update(basePosition: Vector3): void {
        if (!this.hips || !this.baseRotation) {
            return;
        }
        this.hips.position.copy(basePosition);
        this.hips.rotation.copy(this.baseRotation);
    }
}
