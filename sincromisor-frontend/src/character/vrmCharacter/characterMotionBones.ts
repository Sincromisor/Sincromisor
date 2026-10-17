import type { Euler, Object3D } from "three";

/** 体幹の合成レイヤーが差分姿勢を求めるための正規化済みボーンと基準回転。 */
export type CharacterMotionBone = {
    node: Object3D;
    baseRotation: Euler;
};
