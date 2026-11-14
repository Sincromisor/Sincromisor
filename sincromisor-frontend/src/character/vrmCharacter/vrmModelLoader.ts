import { VRMLoaderPlugin, VRMMetaLoaderPlugin } from "@pixiv/three-vrm";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { frontendLogger } from "../../shared/logging/appLogger";

/** VRMとサムネイルを読み込む。モデル反映・世代判定・URL利用終了は呼び出し元が所有する。 */
export function loadVrmModel(url: string): Promise<GLTF> {
    const loader = new GLTFLoader();
    loader.register(
        (parser) =>
            new VRMLoaderPlugin(parser, {
                metaPlugin: new VRMMetaLoaderPlugin(parser, { needThumbnailImage: true }),
            }),
    );
    return new Promise((resolve, reject) => {
        loader.load(
            url,
            resolve,
            (progress) => {
                frontendLogger.debug("Loading VRM model.", {
                    percent: (100 * progress.loaded) / progress.total,
                });
            },
            reject,
        );
    });
}
