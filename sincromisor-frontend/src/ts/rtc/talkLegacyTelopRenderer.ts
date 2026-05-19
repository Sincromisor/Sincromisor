import type { TelopTextSegment } from "./talkManagerTypes";

const FOOTER_BOX_SELECTOR = "div#sincroFooterBox";
const LEGACY_TELOP_CLASS = "sincroFooterBox__telopText";

// React island と併存する旧 footer DOM テロップだけを描画・trimする。
export class TalkLegacyTelopRenderer {
    appendChar(speechId: number, char: string): void {
        const telopText = document.querySelector<HTMLDivElement>(FOOTER_BOX_SELECTOR);
        if (!telopText) {
            return;
        }

        const span = this.findOrCreateSpan(telopText, speechId);
        span.textContent += char;
        this.trimOverflow(telopText);
    }

    renderSnapshot(segments: TelopTextSegment[]): void {
        const telopText = document.querySelector<HTMLDivElement>(FOOTER_BOX_SELECTOR);
        if (!telopText) {
            return;
        }
        this.clear(telopText);
        for (const segment of segments) {
            const span = this.createSpan(segment.speechId);
            span.textContent = segment.text;
            telopText.appendChild(span);
        }
        this.trimOverflow(telopText);
    }

    // Reactや日時表示など他要素を巻き込まないよう、旧DOMテロップspanのみ掃除する。
    clear(telopBox?: Element): void {
        const target = telopBox ?? document.querySelector(FOOTER_BOX_SELECTOR);
        if (!target) {
            return;
        }
        const legacyTelopSpans = target.querySelectorAll(`span.${LEGACY_TELOP_CLASS}`);
        legacyTelopSpans.forEach((node) => {
            node.remove();
        });
    }

    private findOrCreateSpan(telopText: HTMLDivElement, speechId: number): HTMLSpanElement {
        const existingSpan =
            telopText.querySelector<HTMLSpanElement>(`span[data-speech-id="${speechId}"]`) ??
            undefined;
        if (existingSpan) {
            return existingSpan;
        }

        const span = this.createSpan(speechId);
        telopText.appendChild(span);
        return span;
    }

    private createSpan(speechId: number): HTMLSpanElement {
        const span = document.createElement("span");
        span.classList.add(LEGACY_TELOP_CLASS);
        span.setAttribute("data-speech-id", String(speechId));
        return span;
    }

    // footer内の日時など別要素を残したまま、旧DOMテロップだけを幅内へ切り詰める。
    private trimOverflow(telopText: HTMLDivElement): void {
        if (telopText.clientWidth === 0) {
            return;
        }
        const padding = this.readHorizontalPadding(telopText);
        const availableWidth = Math.max(
            0,
            telopText.clientWidth - padding.left - padding.right - this.reservedWidth(telopText),
        );
        let totalWidth = this.telopSpans(telopText).reduce(
            (acc, currentSpan) => acc + currentSpan.offsetWidth,
            0,
        );

        while (totalWidth > availableWidth) {
            const firstSpan = this.telopSpans(telopText)[0];
            if (!firstSpan) {
                break;
            }
            this.dropFirstCharacter(telopText, firstSpan);
            totalWidth = this.telopSpans(telopText).reduce(
                (acc, currentSpan) => acc + currentSpan.offsetWidth,
                0,
            );
        }
    }

    private readHorizontalPadding(telopText: HTMLDivElement): { left: number; right: number } {
        const style = window.getComputedStyle(telopText);
        const paddingLeft = Number.parseInt(style.paddingLeft, 10);
        const paddingRight = Number.parseInt(style.paddingRight, 10);
        return {
            left: Number.isNaN(paddingLeft) ? 0 : paddingLeft,
            right: Number.isNaN(paddingRight) ? 0 : paddingRight,
        };
    }

    private reservedWidth(telopText: HTMLDivElement): number {
        return this.childElements(telopText)
            .filter((child) => !child.classList.contains(LEGACY_TELOP_CLASS))
            .reduce((acc, child) => acc + child.offsetWidth, 0);
    }

    private telopSpans(telopText: HTMLDivElement): HTMLSpanElement[] {
        return this.childElements(telopText).filter(
            (child): child is HTMLSpanElement =>
                child instanceof HTMLSpanElement && child.classList.contains(LEGACY_TELOP_CLASS),
        );
    }

    private childElements(telopText: HTMLDivElement): HTMLElement[] {
        const children: HTMLElement[] = [];
        for (const child of telopText.children) {
            if (child instanceof HTMLElement) {
                children.push(child);
            }
        }
        return children;
    }

    private dropFirstCharacter(telopText: HTMLDivElement, firstSpan: HTMLSpanElement): void {
        if (firstSpan.textContent && firstSpan.textContent.length > 0) {
            firstSpan.textContent = firstSpan.textContent.slice(1);
            if (firstSpan.textContent.length === 0) {
                telopText.removeChild(firstSpan);
            }
            return;
        }
        telopText.removeChild(firstSpan);
    }
}
