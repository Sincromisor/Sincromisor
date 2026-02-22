import { useEffect, useState } from "react";
import { TalkManager, type TelopTextSegment } from "../../ts/RTC/TalkManager";

type SincroTelopViewProps = {
    enableReactRendering?: boolean;
};

// 既存 footer CSS (`.sincroFooterBox__telopText`) を再利用し、テロップ描画を React 化する。
export function SincroTelopView({ enableReactRendering = true }: SincroTelopViewProps) {
    const [segments, setSegments] = useState<TelopTextSegment[]>([]);

    useEffect(() => {
        const talkManager = TalkManager.getManager();
        setSegments(talkManager.getTelopTextSegmentsSnapshot());
        if (enableReactRendering) {
            talkManager.setTelopDomRenderingEnabled(false);
        }
        const unsubscribe = talkManager.subscribe((event) => {
            if (event.type !== "telop_channel_message" || !event.message.new_text) {
                return;
            }
            setSegments(talkManager.getTelopTextSegmentsSnapshot());
        });
        return () => {
            unsubscribe();
        };
    }, [enableReactRendering]);

    return (
        <>
            {segments.map((segment) => (
                <span
                    key={segment.speechId}
                    className="sincroFooterBox__telopText"
                    data-speech-id={segment.speechId}
                >
                    {segment.text}
                </span>
            ))}
        </>
    );
}
