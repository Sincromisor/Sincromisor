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
    const response = await executeRtcSignalingWithRetry(request);
    // HTTP retryはresponse受信までを対象とする。200 body parse failureはidentity不明のterminal errorであり再送しない。
    return response.json();
}

async function executeRtcSignalingWithRetry(request: RtcSignalingRequest): Promise<Response> {
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
            const response = await executeRequest({
                body: request.body,
                clock,
                fetchImplementation,
                operation: request.operation,
                parentSignal: request.signal,
                timeoutMs: Math.min(operationTimeoutMs(request.operation), remainingMs),
                url: request.url,
            });
            if (response.ok) {
                return response;
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

async function executeRequest(params: ExecuteRequestParams): Promise<Response> {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    params.parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const timeoutId = params.clock.setTimeout(() => controller.abort(), params.timeoutMs);
    // native window.fetchはWeb IDLのbrand checkを持つため、paramsのmethodとして呼ばずdetachする。
    // test注入とnativeの両方を同じundefined thisで呼び、browserのIllegal invocationを防ぐ。
    const fetchImplementation = params.fetchImplementation;
    try {
        return await fetchImplementation(params.url, {
            body: params.body,
            headers: { "Content-Type": "application/json" },
            method: "POST",
            signal: controller.signal,
        });
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
};

async function waitBeforeRetry(params: RetryWaitParams): Promise<void> {
    const retryAfterMs = parseRetryAfterMs(params.retryAfter, params.clock.now());
    const capMs = RETRY_CAPS_MS[params.execution - 1] ?? 0;
    const waitMs = retryAfterMs ?? params.clock.random() * capMs;
    const remainingMs = params.deadline - params.clock.now();
    if (remainingMs <= 0 || waitMs >= remainingMs) {
        throw terminalError(params.operation, "RTC signaling retry delay exceeds deadline.");
    }
    await new Promise<void>((resolve) => {
        params.clock.setTimeout(resolve, waitMs);
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
