import type { DebugConsoleSnapshot, DebugConsoleTrendKey } from "../../../ts/UI/DebugConsoleManager";
import { renderTrendGraph } from "./debugConsoleFormatters";

type TrendGraphProps = {
    snapshot: DebugConsoleSnapshot;
    trendKey: DebugConsoleTrendKey;
    title: string;
    id: string;
};

export function TrendGraph({ snapshot, trendKey, title, id }: TrendGraphProps) {
    return (
        <article className="trendCard">
            <h4>{title}</h4>
            <svg id={id} className="trendGraph" viewBox="0 0 300 86" preserveAspectRatio="none">
                <polyline className="trendLine" points={renderTrendGraph(snapshot, trendKey)} />
            </svg>
        </article>
    );
}
