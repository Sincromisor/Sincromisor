import { Component, type ReactNode } from "react";
import { frontendLogger } from "../../../shared/logging/appLogger";

type DebugConsoleErrorBoundaryProps = { children: ReactNode };
type DebugConsoleErrorBoundaryState = { failed: boolean };

/** 詳細表示の取得・描画失敗を診断欄に留め、常設DOMとRTC・追跡の生存期間を守る。 */
export class DebugConsoleErrorBoundary extends Component<
    DebugConsoleErrorBoundaryProps,
    DebugConsoleErrorBoundaryState
> {
    override state: DebugConsoleErrorBoundaryState = { failed: false };

    /** 同じ失敗を再試行せず、ページ再読込まで診断だけを回復案内へ切り替える。 */
    static getDerivedStateFromError(): DebugConsoleErrorBoundaryState {
        return { failed: true };
    }

    /** ルートの起動失敗処理へ渡さず、共通ログに診断表示の失敗を残す。 */
    override componentDidCatch(error: unknown): void {
        frontendLogger.error("Failed to load or render debug panels.", { error });
    }

    /** 境界の外にあるタブ・閉じる操作・音声・映像は失敗時も継続する。 */
    override render(): ReactNode {
        if (this.state.failed) {
            return (
                <p role="alert">
                    診断表示を読み込めませんでした。復旧するにはページを再読み込みしてください。
                </p>
            );
        }
        return this.props.children;
    }
}
