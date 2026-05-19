import type {
    SincroAppLookingGlassConfigStatus,
    SincroAppLookingGlassEventDetail,
} from "../../app/controller/sincroAppTypes";
import type { LookingGlassRuntimeConfig } from "../sincroVrm/lookingGlass/lookingGlassRuntimeConfig";

// Looking Glass のUI表示向け状態を AppController から切り出した tracker。
// runtime config の変更履歴とセッション状態を持ち、再読込/次回セッション反映の判定を集中管理する。
export class SincroAppLookingGlassStateTracker {
    private state: SincroAppLookingGlassEventDetail = { state: "idle" };
    private readonly changedKeys = new Set<keyof LookingGlassRuntimeConfig>();

    getState(): SincroAppLookingGlassEventDetail {
        return { ...this.state };
    }

    setState(nextState: SincroAppLookingGlassEventDetail): void {
        this.state = { ...nextState };
        // active 到達時点で変更差分は反映済みとみなし、UIの pending 表示をクリアする。
        if (nextState.state === "active") {
            this.changedKeys.clear();
        }
    }

    addChangedKeys(keys: Array<keyof LookingGlassRuntimeConfig>): void {
        for (const key of keys) {
            this.changedKeys.add(key);
        }
    }

    getConfigStatus(): SincroAppLookingGlassConfigStatus {
        const changedKeys = Array.from(this.changedKeys);
        if (changedKeys.length === 0) {
            return {
                pendingForNextSession: false,
                reloadRecommended: false,
                changedKeys,
                reloadRecommendedKeys: [],
                nextSessionKeys: [],
            };
        }

        const reloadRecommended = this.state.state === "active" || this.state.state === "starting";
        return {
            pendingForNextSession: true,
            // 実行中セッション中の変更はその場反映できないため、終了後の再起動または再読込を案内する。
            reloadRecommended,
            changedKeys,
            reloadRecommendedKeys: reloadRecommended ? [...changedKeys] : [],
            nextSessionKeys: reloadRecommended ? [] : [...changedKeys],
        };
    }
}
