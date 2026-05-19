export type LookingGlassRuntimeConfig = {
    tileHeight: number;
    numViews: number;
    targetY: number;
    targetZ: number;
    targetDiam: number;
    depthiness: number;
    fovyDeg: number;
};

// Looking Glass の runtime 調整値（UI から更新され、次回セッション開始時の polyfill 初期化に使う）。
const defaultLookingGlassRuntimeConfig: LookingGlassRuntimeConfig = {
    tileHeight: 512,
    numViews: 45,
    // 展示用の縦長画角で全身を収めやすいよう、既定値はやや下寄りにする。
    targetY: 0.85,
    // 展示実機で焦点が合いやすかった「Focus」系の値をベースに、全身が入りやすいよう少し引く。
    targetZ: 0.2,
    targetDiam: 1.5,
    depthiness: 0.85,
    fovyDeg: 24,
};

let currentConfig: LookingGlassRuntimeConfig = { ...defaultLookingGlassRuntimeConfig };

type LookingGlassRuntimeConfigChangedDetail = {
    config: LookingGlassRuntimeConfig;
    changedKeys: Array<keyof LookingGlassRuntimeConfig>;
};

export function getLookingGlassRuntimeConfig(): LookingGlassRuntimeConfig {
    // 呼び出し側で破壊的変更されないようコピーを返す。
    return { ...currentConfig };
}

// React UI からの設定変更を、Three.js/VRM1.0 側の Looking Glass 起動時オプションへ反映する。
export function updateLookingGlassRuntimeConfig(
    partial: Partial<LookingGlassRuntimeConfig>,
): LookingGlassRuntimeConfig {
    // 実際に変わったキーだけを抽出し、AppController 側の「反映タイミング表示」に使う。
    const changedKeys = Object.keys(partial).filter((key) => {
        const typedKey = key as keyof LookingGlassRuntimeConfig;
        const nextValue = partial[typedKey];
        return nextValue !== undefined && currentConfig[typedKey] !== nextValue;
    }) as Array<keyof LookingGlassRuntimeConfig>;

    // React UI の部分更新を安全に取り込めるよう shallow merge にしている。
    currentConfig = {
        ...currentConfig,
        ...partial,
    };
    const nextConfig = getLookingGlassRuntimeConfig();
    if (changedKeys.length > 0) {
        // AppController が「次回セッション反映/再読込推奨」の判断を更新するための通知。
        window.dispatchEvent(
            new CustomEvent<LookingGlassRuntimeConfigChangedDetail>(
                "sincro:looking-glass-config-updated",
                {
                    detail: {
                        config: nextConfig,
                        changedKeys,
                    },
                },
            ),
        );
    }
    return nextConfig;
}
