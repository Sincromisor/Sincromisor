import { frontendLogger } from "../../shared/logging/appLogger";

/** typed failureの復旧判断に使うsignaling operation区分。 */
export type RtcSignalingOperation = "initial-offer" | "update-offer" | "candidate";

/** retryのdeadline、sleep、full jitterを同じ時刻系で制御する注入clock。 */
export type RtcRetryClock = {
    clearTimeout: (timerId: ReturnType<typeof setTimeout>) => void;
    now: () => number;
    random: () => number;
    setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
};

/**
 * 1つのimmutable JSON requestをretry transportへ渡す入力。
 * fetch/clockはtest注入用で、signalはPeerConnection generationのcloseを伝える。
 */
export type RtcSignalingRequest = {
    body: string;
    fetch?: typeof fetch;
    operation: RtcSignalingOperation;
    retryClock?: RtcRetryClock;
    signal?: AbortSignal;
    url: string;
};

const TOTAL_DEADLINE_MS = 30_000;
const MAX_HTTP_EXECUTIONS = 4;
const RETRY_CAPS_MS = [500, 1_000, 2_000];

const defaultClock: RtcRetryClock = {
    clearTimeout: (timerId) => clearTimeout(timerId),
    now: () => Date.now(),
    random: () => Math.random(),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};

/**
 * シグナリングHTTPの失敗をoperationとstatus付きで通知する。
 *
 * 404/410の復旧可否は呼び出し元のsession ownershipで決まるため、この境界では
 * statusを失わず保持し、candidateを含む失敗を握り潰さない。
 */
export class RtcSignalingHttpError extends Error {
    readonly cause?: unknown;
    readonly operation: RtcSignalingOperation;
    readonly status?: number;

    constructor(
        message: string,
        options: {
            cause?: unknown;
            operation: RtcSignalingOperation;
            status?: number;
        },
    ) {
        super(message);
        this.name = "RtcSignalingHttpError";
        this.cause = options.cause;
        this.operation = options.operation;
        this.status = options.status;
    }
}

/**
 * 同じserialized bodyを最大4回送る、30秒deadline付きHTTP transport。
 *
 * 429/5xx/network errorだけをfull jitterで再送する。各実行のAbort timeoutは
 * Offer 10秒/Candidate 5秒と総期限の残時間の小さい方であり、待機が期限へ達する
 * 場合は次のHTTP実行を開始しない。
 */
export async function postRtcSignalingJson(request: RtcSignalingRequest): Promise<unknown> {
    return executeRtcSignalingWithRetry(request);
}

async function executeRtcSignalingWithRetry(request: RtcSignalingRequest): Promise<unknown> {
    const clock = request.retryClock ?? defaultClock;
    const fetchImplementation = request.fetch ?? fetch;
    const deadline = clock.now() + TOTAL_DEADLINE_MS;

    for (let execution = 1; execution <= MAX_HTTP_EXECUTIONS; execution += 1) {
        if (isAborted(request.signal)) {
            throw terminalError(request.operation, "RTC signaling generation was closed.");
        }
        const remainingMs = deadline - clock.now();
        if (remainingMs <= 0) {
            throw terminalError(request.operation, "RTC signaling total deadline exceeded.");
        }

        try {
            const { response, value } = await executeRequest({
                body: request.body,
                clock,
                fetchImplementation,
                operation: request.operation,
                parentSignal: request.signal,
                timeoutMs: Math.min(operationTimeoutMs(request.operation), remainingMs),
                url: request.url,
            });
            if (response.ok) {
                return value;
            }
            if (!isRetryableStatus(response.status) || execution === MAX_HTTP_EXECUTIONS) {
                throw new RtcSignalingHttpError(
                    `RTC signaling failed: ${response.status} ${response.statusText}`,
                    { operation: request.operation, status: response.status },
                );
            }
            await waitBeforeRetry({
                clock,
                deadline,
                execution,
                operation: request.operation,
                retryAfter: response.headers.get("Retry-After"),
                signal: request.signal,
            });
        } catch (error) {
            if (error instanceof RtcSignalingHttpError) {
                throw error;
            }
            if (isAborted(request.signal)) {
                throw terminalError(
                    request.operation,
                    "RTC signaling generation was closed.",
                    error,
                );
            }
            if (execution === MAX_HTTP_EXECUTIONS) {
                throw terminalError(request.operation, "RTC signaling retry exhausted.", error);
            }
            frontendLogger.warn("RTC signaling HTTP execution failed; retrying.", {
                execution,
                operation: request.operation,
            });
            await waitBeforeRetry({
                clock,
                deadline,
                execution,
                operation: request.operation,
                signal: request.signal,
            });
        }
    }
    throw terminalError(request.operation, "RTC signaling retry exhausted.");
}

type ExecuteRequestParams = {
    body: string;
    clock: RtcRetryClock;
    fetchImplementation: typeof fetch;
    operation: RtcSignalingOperation;
    parentSignal?: AbortSignal;
    timeoutMs: number;
    url: string;
};

/** ヘッダーと本文の受信を同じ期限・中断通知で管理し、完了時に購読とタイマーを解除する。 */
async function executeRequest(
    params: ExecuteRequestParams,
): Promise<{ response: Response; value?: unknown }> {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    params.parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const timeoutId = params.clock.setTimeout(() => controller.abort(), params.timeoutMs);
    // native window.fetchはWeb IDLのbrand checkを持つため、paramsのmethodとして呼ばずdetachする。
    // test注入とnativeの両方を同じundefined thisで呼び、browserのIllegal invocationを防ぐ。
    const fetchImplementation = params.fetchImplementation;
    try {
        const response = await fetchImplementation(params.url, {
            body: params.body,
            headers: { "Content-Type": "application/json" },
            method: "POST",
            signal: controller.signal,
        });
        // 復旧する404/410や再試行中の失敗も、HTTP実行ごとに一度だけ記録する。
        if (!response.ok)
            frontendLogger.diagnostic("signaling", "failed", {
                operation: params.operation,
                http_status: response.status,
            });
        if (!response.ok) {
            // 再試行中も不要な本文を読み続けず、接続資源を解放する。
            // 本文が既に壊れていても、復旧判断に必要な受信済み404/410などの状態を維持する。
            await response.body?.cancel().catch(() => {});
            return { response };
        }
        try {
            return { response, value: await response.json() };
        } catch (error) {
            // 時間切れ・世代中断は通信失敗として扱い、不正JSONだけは再送せず終了する。
            if (controller.signal.aborted) throw error;
            throw terminalError(params.operation, "RTC signaling response JSON is invalid.", error);
        }
    } catch (error) {
        frontendLogger.diagnostic("signaling", "failed", { operation: params.operation });
        throw error;
    } finally {
        params.clock.clearTimeout(timeoutId);
        params.parentSignal?.removeEventListener("abort", abortFromParent);
    }
}

type RetryWaitParams = {
    clock: RtcRetryClock;
    deadline: number;
    execution: number;
    operation: RtcSignalingOperation;
    retryAfter?: string | null;
    signal?: AbortSignal;
};

async function waitBeforeRetry(params: RetryWaitParams): Promise<void> {
    const retryAfterMs = parseRetryAfterMs(params.retryAfter, params.clock.now());
    const capMs = RETRY_CAPS_MS[params.execution - 1] ?? 0;
    const waitMs = retryAfterMs ?? params.clock.random() * capMs;
    const remainingMs = params.deadline - params.clock.now();
    if (remainingMs <= 0 || waitMs >= remainingMs) {
        throw terminalError(params.operation, "RTC signaling retry delay exceeds deadline.");
    }
    // 停止後にRetry-Afterの期限まで交渉を残さず、待機も接続世代の生存期間に従わせる。
    await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            params.clock.clearTimeout(timer);
            params.signal?.removeEventListener("abort", onAbort);
            reject(terminalError(params.operation, "RTC signaling generation was closed."));
        };
        const timer = params.clock.setTimeout(() => {
            params.signal?.removeEventListener("abort", onAbort);
            resolve();
        }, waitMs);
        params.signal?.addEventListener("abort", onAbort, { once: true });
        if (params.signal?.aborted) onAbort();
    });
}

function parseRetryAfterMs(value: string | null | undefined, nowMs: number): number | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1_000;
    }
    const dateMs = Date.parse(value);
    return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - nowMs);
}

function operationTimeoutMs(operation: RtcSignalingOperation): number {
    return operation === "candidate" ? 5_000 : 10_000;
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

function isAborted(signal: AbortSignal | undefined): boolean {
    return signal?.aborted ?? false;
}

function terminalError(
    operation: RtcSignalingOperation,
    message: string,
    cause?: unknown,
): RtcSignalingHttpError {
    return new RtcSignalingHttpError(message, { cause, operation });
}
