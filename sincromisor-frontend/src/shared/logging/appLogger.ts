import { BrowserDiagnostics, type DiagnosticEvent, diagnosticReason } from "./browserDiagnostics";

export type LogContext = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
    level: LogLevel;
    message: string;
    context?: LogContext;
};

// 既存の固定メッセージだけを選び、動的な本文を分類キーにしない。
const DIAGNOSTIC_MESSAGES: Record<string, DiagnosticEvent | undefined> = {
    "Failed to load VRM model.": "model",
    "Failed to fetch RTC config.": "signaling",
    "Invalid telop channel payload.": "rtc_telop",
    "Invalid text channel payload.": "rtc_text",
    "Failed to bootstrap VRM page.": "render",
    "RTC generation failed terminally.": "signaling",
    "RTC signaling HTTP execution failed; retrying.": "signaling",
};

/** consoleと安全な端末診断の共通入口。任意contextは中央へ送らない。 */
class FrontendLogger {
    readonly diagnostics = new BrowserDiagnostics();

    /** 固定イベントと理由だけを非同期転送へ渡す。 */
    diagnostic(event: DiagnosticEvent, reason: string): void {
        this.diagnostics.record(event, reason);
    }

    debug(message: string, context?: LogContext): void {
        this.write("debug", message, context);
    }

    info(message: string, context?: LogContext): void {
        this.write("info", message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.write("warn", message, context);
    }

    error(message: string, context?: LogContext): void {
        this.write("error", message, context);
    }

    private write(level: LogLevel, message: string, context?: LogContext): void {
        // 既存の固定ログ入口だけを対応付け、文字列そのものやcontextを複製しない。
        const event = DIAGNOSTIC_MESSAGES[message];
        if (event) this.diagnostic(event, diagnosticReason(context?.error));
        const entry: LogEntry =
            context === undefined ? { level, message } : { level, message, context };
        switch (level) {
            case "debug":
                console.debug(entry); // reason: frontend logger の browser console transport を集約するため。
                break;
            case "info":
                console.info(entry); // reason: frontend logger の browser console transport を集約するため。
                break;
            case "warn":
                console.warn(entry); // reason: frontend logger の browser console transport を集約するため。
                break;
            case "error":
                console.error(entry); // reason: frontend logger の browser console transport を集約するため。
                break;
        }
    }
}

export const frontendLogger = new FrontendLogger();
