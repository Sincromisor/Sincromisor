import type { TelopTextSegment } from "./talkManagerTypes";

// React footerテロップは幅ベースtrimを行わないため、保持件数を抑えて更新コストを安定させる。
const MAX_TELOP_SEGMENT_COUNT = 6;
// 長時間稼働時の保険として、React表示用の総文字数を単純上限で制御する。
const MAX_TELOP_TOTAL_CHARS = 240;

/** React用の発話単位履歴を保持し、古い文字から件数・文字数を制限する。 */
export class TalkTelopSegmentBuffer {
    private segments: TelopTextSegment[] = [];

    /** 初期表示と受信後の表示で共有する履歴を古い順に返す。 */
    snapshot(): TelopTextSegment[] {
        return [...this.segments];
    }

    /** 同一発話へ文字列を連結し、最新6発話・合計240文字以内に収める。 */
    appendChar(speechId: number, char: string): void {
        const index = this.segments.findIndex((segment) => segment.speechId === speechId);
        if (index >= 0) {
            const target = this.segments[index];
            this.segments[index] = { ...target, text: target.text + char };
        } else {
            this.segments.push({ speechId, text: char });
        }
        this.trimBySegmentCount();
        this.trimByTotalChars(MAX_TELOP_TOTAL_CHARS);
        this.segments = this.segments.filter((segment) => segment.text.length > 0);
    }

    private trimBySegmentCount(): void {
        if (this.segments.length <= MAX_TELOP_SEGMENT_COUNT) {
            return;
        }
        this.segments = this.segments.slice(-MAX_TELOP_SEGMENT_COUNT);
    }

    // 先頭（古いテロップ）から文字を落として、表示用バッファの総文字数を抑える。
    private trimByTotalChars(maxTotalChars: number): void {
        let totalChars = this.segments.reduce((acc, segment) => acc + segment.text.length, 0);
        if (totalChars <= maxTotalChars) {
            return;
        }

        const nextSegments: TelopTextSegment[] = this.segments.map((segment) => ({ ...segment }));
        while (totalChars > maxTotalChars && nextSegments.length > 0) {
            const first = nextSegments[0];
            if (first.text.length <= 0) {
                nextSegments.shift();
                continue;
            }
            first.text = first.text.slice(1);
            totalChars -= 1;
            if (first.text.length === 0) {
                nextSegments.shift();
            }
        }
        this.segments = nextSegments;
    }
}
