/**
 * File または string から motion-debug replay text を読む入力境界。
 * compressed Blob import は扱わず、plain NDJSON の text 化だけを caller に返す。
 */
export async function readMotionDebugReplayText(
    fileOrText: unknown,
): Promise<{ ok: true; text: string } | { ok: false; code: "unsupported_input"; message: string }> {
    if (typeof fileOrText === "string") {
        return { ok: true, text: fileOrText };
    }
    if (typeof File !== "undefined" && fileOrText instanceof File) {
        return { ok: true, text: await fileOrText.text() };
    }
    return {
        ok: false,
        code: "unsupported_input",
        message: "Motion replay accepts only plain NDJSON string or File inputs.",
    };
}
