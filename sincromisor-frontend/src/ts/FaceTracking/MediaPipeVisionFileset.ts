import { FilesetResolver } from "@mediapipe/tasks-vision";

declare const __MEDIAPIPE_TASKS_VISION_VERSION__: string;

const MEDIAPIPE_WASM_PATH = "/mediapipe-wasm";
const MEDIAPIPE_TASKS_VISION_CACHE_KEY = `tasks-vision-${__MEDIAPIPE_TASKS_VISION_VERSION__}`;

let visionFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

// MediaPipe の JS glue と wasm は同じ npm package 由来で揃える必要がある。
// public 配下の wasm は非 hash ファイル名なので、依存更新後のブラウザキャッシュ混在を query で避ける。
export function loadMediaPipeVisionFileset(): ReturnType<typeof FilesetResolver.forVisionTasks> {
    if (!visionFilesetPromise) {
        visionFilesetPromise = FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH)
            .then((fileset) => ({
                ...fileset,
                wasmLoaderPath: withCacheKey(fileset.wasmLoaderPath),
                wasmBinaryPath: withCacheKey(fileset.wasmBinaryPath),
                assetLoaderPath: fileset.assetLoaderPath ? withCacheKey(fileset.assetLoaderPath) : undefined,
                assetBinaryPath: fileset.assetBinaryPath ? withCacheKey(fileset.assetBinaryPath) : undefined,
            }));
    }
    return visionFilesetPromise;
}

function withCacheKey(path: string): string {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(MEDIAPIPE_TASKS_VISION_CACHE_KEY)}`;
}
