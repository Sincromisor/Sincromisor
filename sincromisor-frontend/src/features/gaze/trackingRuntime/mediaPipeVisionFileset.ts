/**
 * MediaPipe Tasks Vision の fileset resolver を frontend の public asset path へ接続する境界。
 * WASM 配置失敗は caller の初期化失敗として扱い、この module は tracker や DOM lifecycle を所有しない。
 */
import { FilesetResolver } from "@mediapipe/tasks-vision";

declare const __MEDIAPIPE_TASKS_VISION_VERSION__: string;

const MEDIAPIPE_WASM_PATH = "/mediapipe-wasm";
const MEDIAPIPE_TASKS_VISION_CACHE_KEY = `tasks-vision-${__MEDIAPIPE_TASKS_VISION_VERSION__}`;
const MEDIAPIPE_WORKER_WASM_LOADER_PATH = `${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.js`;
const MEDIAPIPE_WORKER_WASM_BINARY_PATH = `${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.wasm`;

let visionFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | undefined;

// MediaPipe の JS glue と wasm は同じ npm package 由来で揃える必要がある。
// public 配下の wasm は非 hash ファイル名なので、依存更新後のブラウザキャッシュ混在を query で避ける。
export function loadMediaPipeVisionFileset(): ReturnType<typeof FilesetResolver.forVisionTasks> {
    if (!visionFilesetPromise) {
        visionFilesetPromise = FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH).then(
            (fileset) => ({
                ...fileset,
                wasmLoaderPath: withCacheKey(resolveWasmLoaderPath(fileset.wasmLoaderPath)),
                wasmBinaryPath: withCacheKey(resolveWasmBinaryPath(fileset.wasmBinaryPath)),
                assetLoaderPath: fileset.assetLoaderPath
                    ? withCacheKey(fileset.assetLoaderPath)
                    : undefined,
                assetBinaryPath: fileset.assetBinaryPath
                    ? withCacheKey(fileset.assetBinaryPath)
                    : undefined,
            }),
        );
    }
    return visionFilesetPromise;
}

function resolveWasmLoaderPath(defaultPath: string): string {
    return isWorkerGlobalScope() ? MEDIAPIPE_WORKER_WASM_LOADER_PATH : defaultPath;
}

function resolveWasmBinaryPath(defaultPath: string): string {
    return isWorkerGlobalScope() ? MEDIAPIPE_WORKER_WASM_BINARY_PATH : defaultPath;
}

function isWorkerGlobalScope(): boolean {
    return typeof document === "undefined";
}

function withCacheKey(path: string): string {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(MEDIAPIPE_TASKS_VISION_CACHE_KEY)}`;
}
