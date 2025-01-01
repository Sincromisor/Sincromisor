import { Euler, Quaternion } from 'three';

// オイラー角を元に、ローパスフィルタ、
// 球面線形補完をおこなったクオータニオンを扱うクラス
export class RotationFilter {
    private rotation: Euler;
    private alpha: number = 0.1;

    constructor(rotaion: Euler) {
        this.rotation = rotaion;
    }

    // 新たに得たオイラー角を元に、ローパスフィルタと
    // 球面線形補完をおこなった結果をrotationに反映
    update(newRX: number, newRY: number, newRZ: number): void {
        const x: number = this.lowPassFilter(newRX, this.rotation.x, this.alpha);
        const y: number = this.lowPassFilter(newRY, this.rotation.y, this.alpha);
        const z: number = this.lowPassFilter(newRZ, this.rotation.z, this.alpha);

        const start_q: Quaternion = new Quaternion();
        start_q.setFromEuler(this.rotation);
        const end_q: Quaternion = new Quaternion();
        end_q.setFromEuler(new Euler(x, y, z));

        // 球面線形補完
        const result_q: Quaternion = start_q.slerp(end_q, this.alpha);

        this.rotation = new Euler().setFromQuaternion(result_q);
    }

    // ローパスフィルタ
    private lowPassFilter(newValue: number, prevValue: number, alpha: number): number {
        return prevValue + alpha * (newValue - prevValue);
    }
}
