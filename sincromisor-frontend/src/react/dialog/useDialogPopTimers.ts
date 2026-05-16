import { useCallback, useEffect, useRef } from "react";

type TimerCleanup = () => void;
type TimeoutHandle = ReturnType<typeof setTimeout>;

// Dialog pop 用のタイマー cleanup 管理を hook 化する。
// コンポーネント本体から timer bookkeeping を切り離し、表示ロジックを読みやすく保つ。
export function useDialogPopTimers() {
    const pendingTimerCleanupsRef = useRef<Set<TimerCleanup>>(new Set());
    const cleanupRegistryTimersRef = useRef<Set<TimeoutHandle>>(new Set());

    const register = useCallback((cleanupTimer: TimerCleanup, removeAfterMs: number) => {
        pendingTimerCleanupsRef.current.add(cleanupTimer);
        const wrappedCleanup = () => {
            cleanupTimer();
            pendingTimerCleanupsRef.current.delete(cleanupTimer);
        };

        // schedule helper の内部完了を外から検知しない代わりに、
        // 余裕を持った時刻で cleanup registry からも掃除する。
        const registryCleanupTimer = setTimeout(() => {
            wrappedCleanup();
            cleanupRegistryTimersRef.current.delete(registryCleanupTimer);
        }, removeAfterMs);
        cleanupRegistryTimersRef.current.add(registryCleanupTimer);
    }, []);

    const clearAll = useCallback(() => {
        // helper 内の show/hide/remove タイマーを一括解除し、unmount 後の遅延更新を防ぐ。
        pendingTimerCleanupsRef.current.forEach((cleanup) => {
            cleanup();
        });
        pendingTimerCleanupsRef.current.clear();
        cleanupRegistryTimersRef.current.forEach((timer) => {
            clearTimeout(timer);
        });
        cleanupRegistryTimersRef.current.clear();
    }, []);

    useEffect(() => {
        return () => {
            clearAll();
        };
    }, [clearAll]);

    return {
        register,
        clearAll,
    };
}
