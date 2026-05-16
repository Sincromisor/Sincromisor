import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type { TelopTextSegment } from "../../ts/App/SincroAppTypes";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";

type SincroTelopViewProps = {
    enableReactRendering?: boolean;
};

// 既存 footer CSS (`.sincroFooterBox__telopText`) を再利用し、テロップ描画を React 化する。
export function SincroTelopView({ enableReactRendering = true }: SincroTelopViewProps) {
    const initialController = SincroAppController.getCurrent();
    const [segments, setSegments] = useState<TelopTextSegment[]>(
        initialController?.state.getTelopTextSegmentsSnapshot() ?? [],
    );
    // footer表示領域。overflow後に最新文字へ追従するため scrollLeft を直接操作する。
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const unsubscribe = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                if (!controller) {
                    setSegments([]);
                    return;
                }
                setSegments(controller.state.getTelopTextSegmentsSnapshot());
            },
            onBeforeSubscribe: (controller) => {
                if (enableReactRendering) {
                    controller.chat.setTelopDomRenderingEnabled(false);
                }
            },
            onCleanupController: (controller) => {
                if (enableReactRendering) {
                    controller.chat.setTelopDomRenderingEnabled(true);
                }
            },
            onEvent: (event, controller) => {
                if (event.type !== "telop_message" || !event.message.new_text) {
                    return;
                }
                setSegments(controller.state.getTelopTextSegmentsSnapshot());
            },
        });
        return unsubscribe;
    }, [enableReactRendering]);

    useLayoutEffect(() => {
        const node = containerRef.current;
        if (!node) {
            return;
        }
        // 初期表示は左端開始のまま、横幅を超えたタイミングからだけ末尾（最新文字）に追従する。
        const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
        node.scrollLeft = maxScrollLeft;
    });

    return (
        <div
            ref={containerRef}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                width: "100%",
                height: "100%",
                minWidth: 0,
                flex: "1 1 auto",
                marginRight: "auto",
                overflow: "hidden",
                whiteSpace: "nowrap",
            }}
        >
            {segments.map((segment) => (
                <span
                    key={segment.speechId}
                    className="sincroFooterBox__telopText"
                    data-speech-id={segment.speechId}
                >
                    {segment.text}
                </span>
            ))}
        </div>
    );
}
