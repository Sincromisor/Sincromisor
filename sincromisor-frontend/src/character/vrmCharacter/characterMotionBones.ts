import type { Object3D } from "three/src/core/Object3D.js";
import type { Euler } from "three/src/math/Euler.js";

/** 体幹の合成レイヤーが差分姿勢を求めるための正規化済みボーンと基準回転。 */
export type CharacterMotionBone = {
    node: Object3D;
    baseRotation: Euler;
};
