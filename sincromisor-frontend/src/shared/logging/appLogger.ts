export type LogContext = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
    level: LogLevel;
    message: string;
    context?: LogContext;
};

class FrontendLogger {
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
