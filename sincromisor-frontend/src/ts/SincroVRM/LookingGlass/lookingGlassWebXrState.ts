export type LookingGlassStateEventDetail = {
    state: "idle" | "starting" | "recovering" | "active" | "error";
    code?:
        | "button_not_found"
        | "webxr_unavailable"
        | "session_start_failed"
        | "polyfill_init_failed"
        | "retry_after_error"
        | "session_ended";
    message?: string;
};
