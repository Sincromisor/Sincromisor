/** ビルド後に実行し、設定の直接読込み、共有依存の分類とMPA公開先を確認する。 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import config from "../../../../sincromisor-frontend/vite.config.js";

const name = config.build.rolldownOptions.output.codeSplitting.groups[0].name;
assert.equal(name("/src/app.ts"), undefined);
for (const dependency of ["react", "react-dom", "scheduler"]) {
    assert.equal(name(`/node_modules/${dependency}/index.js`), "vendor_react");
}
assert.equal(name("/node_modules/three/examples/jsm/loaders/GLTFLoader.js"), "vendor_three_examples");
assert.equal(name("/node_modules/three/src/core/Timer.js"), "vendor_three");
for (const page of ["", "simple-vrm", "vrm360", "looking-glass-vrm", "motion-debug", "pose-landmarker-spike"]) {
    assert(existsSync(join(config.build.outDir, page, "index.html")), page);
}
console.log("設定・チャンク分類・公開HTML: PASS");
