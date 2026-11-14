import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const contents_src = resolve(import.meta.dirname, "src");
const require = createRequire(import.meta.url);
const frontendPackageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"),
);
const mediapipeTasksVisionPackageJson = JSON.parse(
    readFileSync(
        resolve(dirname(require.resolve("@mediapipe/tasks-vision")), "package.json"),
        "utf8",
    ),
);
const mediapipeTasksVisionVersion = mediapipeTasksVisionPackageJson.version;
const gitCommit = process.env.SINCROMISOR_GIT_COMMIT;
const reactRuntimePackages = ["/react/", "/react-dom/", "/scheduler/"];
// ビルド入力・開発時の書き換え・出力HTMLの配置を、このページ定義に揃える。
const pageRouteAliases = [
    {
        inputName: "main",
        source: "pages/main/index.html",
        publicPath: "index.html",
        devRoutes: ["/", "/index.html"],
    },
    {
        inputName: "simple_vrm",
        source: "pages/simpleVrm/index.html",
        publicPath: "simple-vrm/index.html",
        devRoutes: ["/simple-vrm", "/simple-vrm/", "/simple-vrm/index.html"],
    },
    {
        inputName: "vrm360",
        source: "pages/vrm360/index.html",
        publicPath: "vrm360/index.html",
        devRoutes: ["/vrm360", "/vrm360/", "/vrm360/index.html"],
    },
    {
        inputName: "looking_glass_vrm",
        source: "pages/lookingGlassVrm/index.html",
        publicPath: "looking-glass-vrm/index.html",
        devRoutes: ["/looking-glass-vrm", "/looking-glass-vrm/", "/looking-glass-vrm/index.html"],
    },
    {
        inputName: "motion_debug",
        source: "pages/motionDebug/index.html",
        publicPath: "motion-debug/index.html",
        devRoutes: ["/motion-debug", "/motion-debug/", "/motion-debug/index.html"],
    },
    {
        inputName: "pose_landmarker_spike",
        source: "pages/poseLandmarkerSpike/index.html",
        publicPath: "pose-landmarker-spike/index.html",
        devRoutes: [
            "/pose-landmarker-spike",
            "/pose-landmarker-spike/",
            "/pose-landmarker-spike/index.html",
        ],
    },
];

/** 公開URLの別名を生成元へ書き換え、クエリーはそのまま渡す。 */
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

/** 同じページ定義で開発サーバーを接続し、ビルド後のHTMLを公開位置へ移す。 */
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

/** 通常ビルドの入力名と生成元をページ定義から導出する。 */
function buildInputMap() {
    return Object.fromEntries(
        pageRouteAliases.map((page) => [page.inputName, resolve(contents_src, page.source)]),
    );
}

export default defineConfig({
    appType: "mpa",
    define: {
        __SINCROMISOR_FRONTEND_VERSION__: JSON.stringify(frontendPackageJson.version ?? "unknown"),
        __MEDIAPIPE_TASKS_VISION_VERSION__: JSON.stringify(mediapipeTasksVisionVersion),
        __SINCROMISOR_GIT_COMMIT__:
            gitCommit === undefined ? "undefined" : JSON.stringify(gitCommit),
    },
    server: {
        open: true,
    },
    worker: {
        format: "es",
    },
    // SWC固有変換は使わず、Vite標準のOxc経路でJSXとFast Refreshを処理する。
    plugins: [react(), sincroPageRouteAliasPlugin()],
    root: contents_src,
    publicDir: resolve(import.meta.dirname, "public"),
    build: {
        // 圧縮後の構文は最低対象のOBS Studio 33.0.0 / CEF 150に合わせる。
        cssTarget: "chrome150",
        emptyOutDir: true,
        outDir: resolve(import.meta.dirname, "dist"),
        rolldownOptions: {
            input: buildInputMap(),
            output: {
                codeSplitting: {
                    groups: [
                        {
                            // 名前関数で分類するグループをビルド時間レポートで識別する。
                            debugName: "依存ライブラリ分類",
                            // 既存のvendor分類を一つの名前関数で保ち、依存だけを手動分割する。
                            name: (id) => {
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
                                return "vendor_misc";
                            },
                        },
                    ],
                },
            },
        },
    },
});
