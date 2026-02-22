export type LookingGlassRuntimeConfig = {
    tileHeight: number;
    numViews: number;
    targetY: number;
    targetZ: number;
    targetDiam: number;
    depthiness: number;
    fovyDeg: number;
};

const defaultLookingGlassRuntimeConfig: LookingGlassRuntimeConfig = {
    tileHeight: 512,
    numViews: 45,
    targetY: 1.25,
    targetZ: 0.5,
    targetDiam: 0.85,
    depthiness: 1.0,
    fovyDeg: 25,
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
export function updateLookingGlassRuntimeConfig(partial: Partial<LookingGlassRuntimeConfig>): LookingGlassRuntimeConfig {
    const changedKeys = Object.keys(partial).filter((key) => {
        const typedKey = key as keyof LookingGlassRuntimeConfig;
        const nextValue = partial[typedKey];
        return nextValue != null && currentConfig[typedKey] !== nextValue;
    }) as Array<keyof LookingGlassRuntimeConfig>;

    // React UI の部分更新を安全に取り込めるよう shallow merge にしている。
    currentConfig = {
        ...currentConfig,
        ...partial,
    };
    const nextConfig = getLookingGlassRuntimeConfig();
    if (changedKeys.length > 0) {
        // AppController が「次回セッション反映/再読込推奨」の判断を更新するための通知。
        window.dispatchEvent(new CustomEvent<LookingGlassRuntimeConfigChangedDetail>("sincro:looking-glass-config-updated", {
            detail: {
                config: nextConfig,
                changedKeys,
            },
        }));
    }
    return nextConfig;
}
