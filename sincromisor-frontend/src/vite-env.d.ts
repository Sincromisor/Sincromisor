/// <reference types="vite/client" />

declare const __SINCROMISOR_FRONTEND_VERSION__: string | undefined;
declare const __MEDIAPIPE_TASKS_VISION_VERSION__: string | undefined;

/**
 * build / CI caller が `SINCROMISOR_GIT_COMMIT` から注入する provenance 候補。
 * 未設定 build では `undefined` であり、利用側は形式検証後だけ保存する。
 */
declare const __SINCROMISOR_GIT_COMMIT__: string | undefined;
