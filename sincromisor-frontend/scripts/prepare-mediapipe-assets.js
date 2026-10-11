import { cp, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// インストール済みパッケージを配信素材の唯一の供給元にする。
// 一時領域へのコピー完了後に生成先だけを交換し、古いファイルや壊れたリンクを残さない。
const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
// workspaceの巻き上げ・入れ子配置のどちらもNodeのパッケージ解決に従う。
const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
const publicRoot = join(frontendRoot, "public");
const destination = join(publicRoot, "mediapipe-wasm");
const entries = await readdir(source, { withFileTypes: true });
if (!entries.some((entry) => entry.isFile() && entry.name.endsWith(".wasm"))) {
    throw new Error("MediaPipe WASM assets are missing from the installed package");
}
await mkdir(publicRoot, { recursive: true });
const staging = await mkdtemp(join(publicRoot, ".mediapipe-wasm-"));
try {
    await cp(source, staging, { recursive: true, dereference: true });
    // rmは生成先自身がリンクでもリンク先を削除しない。他のpublic素材には触れない。
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
} finally {
    await rm(staging, { recursive: true, force: true });
}
