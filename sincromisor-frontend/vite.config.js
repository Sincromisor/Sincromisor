import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const contents_src = resolve(__dirname, "src");
const require = createRequire(import.meta.url);
const frontendPackageJson = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
const mediapipeTasksVisionPackageJson = JSON.parse(
    readFileSync(
        resolve(dirname(require.resolve("@mediapipe/tasks-vision")), "package.json"),
        "utf8",
    ),
);
const mediapipeTasksVisionVersion = mediapipeTasksVisionPackageJson.version;
const reactRuntimePackages = ["/react/", "/react-dom/", "/scheduler/"];
const pageRouteAliases = [
    {
        source: "pages/main/index.html",
        publicPath: "index.html",
        devRoutes: ["/", "/index.html"],
    },
    {
        source: "pages/simpleVrm/index.html",
        publicPath: "simple-vrm/index.html",
        devRoutes: ["/simple-vrm", "/simple-vrm/", "/simple-vrm/index.html"],
    },
    {
        source: "pages/vrm360/index.html",
        publicPath: "vrm360/index.html",
        devRoutes: ["/vrm360", "/vrm360/", "/vrm360/index.html"],
    },
    {
        source: "pages/lookingGlassVrm/index.html",
        publicPath: "looking-glass-vrm/index.html",
        devRoutes: ["/looking-glass-vrm", "/looking-glass-vrm/", "/looking-glass-vrm/index.html"],
    },
    {
        source: "pages/motionDebug/index.html",
        publicPath: "motion-debug/index.html",
        devRoutes: ["/motion-debug", "/motion-debug/", "/motion-debug/index.html"],
    },
    {
        source: "pages/poseLandmarkerSpike/index.html",
        publicPath: "pose-landmarker-spike/index.html",
        devRoutes: [
            "/pose-landmarker-spike",
            "/pose-landmarker-spike/",
            "/pose-landmarker-spike/index.html",
        ],
    },
];

function rewritePageRouteRequest(req, _res, next) {
    if (!req.url) {
        next();
        return;
    }
    const queryStartIndex = req.url.indexOf("?");
    const requestPath = queryStartIndex === -1 ? req.url : req.url.slice(0, queryStartIndex);
    const query = queryStartIndex === -1 ? "" : req.url.slice(queryStartIndex);
    const routeAlias = pageRouteAliases.find((alias) => alias.devRoutes.includes(requestPath));
    if (routeAlias) {
        req.url = `/${routeAlias.source}${query}`;
    }
    next();
}

function sincroPageRouteAliasPlugin() {
    return {
        name: "sincro-page-route-alias",
        configureServer(server) {
            server.middlewares.use(rewritePageRouteRequest);
        },
        writeBundle(options) {
            if (!options.dir) {
                return;
            }
            for (const routeAlias of pageRouteAliases) {
                const sourcePath = resolve(options.dir, routeAlias.source);
                if (!existsSync(sourcePath)) {
                    continue;
                }
                const publicPath = resolve(options.dir, routeAlias.publicPath);
                mkdirSync(dirname(publicPath), { recursive: true });
                renameSync(sourcePath, publicPath);
            }
        },
    };
}

function buildInputMap() {
    return {
        main: resolve(contents_src, "pages/main/index.html"),
        simple_vrm: resolve(contents_src, "pages/simpleVrm/index.html"),
        vrm360: resolve(contents_src, "pages/vrm360/index.html"),
        looking_glass_vrm: resolve(contents_src, "pages/lookingGlassVrm/index.html"),
        motion_debug: resolve(contents_src, "pages/motionDebug/index.html"),
        pose_landmarker_spike: resolve(contents_src, "pages/poseLandmarkerSpike/index.html"),
    };
}

export default defineConfig({
    appType: "mpa",
    define: {
        __SINCROMISOR_FRONTEND_VERSION__: JSON.stringify(frontendPackageJson.version ?? "unknown"),
        __MEDIAPIPE_TASKS_VISION_VERSION__: JSON.stringify(mediapipeTasksVisionVersion),
    },
    server: {
        open: true,
    },
    worker: {
        format: "es",
    },
    plugins: [react(), sincroPageRouteAliasPlugin()],
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
