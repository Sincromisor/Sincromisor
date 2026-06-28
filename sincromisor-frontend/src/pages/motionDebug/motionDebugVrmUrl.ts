/**
 * motion-debug 起動時に利用する VRM URL を query / default から解決する。
 * invalid URL は user-visible error ではなく frontend logger と default fallback に落とし、モデル読み込み lifecycle は scene runtime に残す。
 */
import { frontendLogger } from "../../shared/logging/appLogger";
import { formatError } from "./dom";

const DEFAULT_VRM_URL = "/characters/default.vrm";
const VRM_URL_QUERY_PARAM = "vrm";

export function getMotionDebugVrmUrl(): string {
    const requestedUrl = new URLSearchParams(window.location.search).get(VRM_URL_QUERY_PARAM);
    if (!requestedUrl) {
        return DEFAULT_VRM_URL;
    }

    try {
        const resolvedUrl = new URL(requestedUrl, window.location.origin);
        if (resolvedUrl.origin !== window.location.origin) {
            frontendLogger.warn("Ignored cross-origin motion-debug VRM URL.", {
                requestedUrl,
            });
            return DEFAULT_VRM_URL;
        }
        // VRM 差し替えは public characters 配下に限定し、任意 URL 読み込み境界を広げない。
        if (!resolvedUrl.pathname.startsWith("/characters/")) {
            frontendLogger.warn("Ignored motion-debug VRM URL outside /characters/.", {
                requestedUrl,
            });
            return DEFAULT_VRM_URL;
        }
        return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
    } catch (error) {
        frontendLogger.warn("Ignored invalid motion-debug VRM URL.", {
            error: formatError(error),
            requestedUrl,
        });
        return DEFAULT_VRM_URL;
    }
}
