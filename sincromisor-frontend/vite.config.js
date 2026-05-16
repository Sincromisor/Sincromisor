import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const contents_src = resolve(__dirname, "src");
const require = createRequire(import.meta.url);
const mediapipeTasksVisionPackageJson = JSON.parse(
    readFileSync(
        resolve(dirname(require.resolve("@mediapipe/tasks-vision")), "package.json"),
        "utf8",
    ),
);
const mediapipeTasksVisionVersion = mediapipeTasksVisionPackageJson.version;
const reactRuntimePackages = ["/react/", "/react-dom/", "/scheduler/"];

function buildInputMap() {
    return {
        main: resolve(contents_src, "index.html"),
        simple_vrm: resolve(contents_src, "simple-vrm/index.html"),
        vrm360: resolve(contents_src, "vrm360/index.html"),
        looking_glass_vrm: resolve(contents_src, "looking-glass-vrm/index.html"),
        motion_debug: resolve(contents_src, "motion-debug/index.html"),
    };
}

export default defineConfig({
    appType: "mpa",
    define: {
        __MEDIAPIPE_TASKS_VISION_VERSION__: JSON.stringify(mediapipeTasksVisionVersion),
    },
    server: {
        open: true,
    },
    worker: {
        format: "es",
    },
    plugins: [react()],
    root: contents_src,
    publicDir: resolve(__dirname, "public"),
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, "dist"),
        rollupOptions: {
            input: buildInputMap(),
            output: {
                manualChunks: (id) => {
                    if (!id.includes("node_modules")) {
                        return undefined;
                    }
                    // Three/VRM 系と React/UI 系を分け、初期ロードの差分更新時に再利用されやすくする。
                    // three/examples は three 本体と分離し、更新頻度の低い補助モジュール群の再利用性を上げる。
                    // React runtime は scheduler まで含めて 1 chunk に閉じ、vendor_misc との循環参照を避ける。
                    if (id.includes("/three/examples/")) {
                        return "vendor_three_examples";
                    }
                    if (id.includes("@pixiv/three-vrm-animation")) {
                        return "vendor_vrm_animation";
                    }
                    if (id.includes("@pixiv/three-vrm")) {
                        return "vendor_vrm";
                    }
                    if (id.includes("/three/")) {
                        return "vendor_three";
                    }
                    if (reactRuntimePackages.some((segment) => id.includes(segment))) {
                        return "vendor_react";
                    }
                    if (id.includes("/@mediapipe/")) {
                        return "vendor_mediapipe";
                    }
                    if (id.includes("/onnxruntime-web/")) {
                        return "vendor_onnxruntime";
                    }
                    if (id.includes("@lookingglass/webxr")) {
                        return "vendor_looking_glass";
                    }
                    if (id.includes("/@microsoft/fetch-event-source/")) {
                        return "vendor_network";
                    }
                    if (id.includes("/hls.js/")) {
                        return "vendor_hls";
                    }
                    if (id.includes("/js-yaml/")) {
                        return "vendor_yaml";
                    }
                    return "vendor_misc";
                },
            },
        },
    },
});
