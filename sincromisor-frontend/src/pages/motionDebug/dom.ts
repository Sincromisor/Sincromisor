/**
 * motion-debug page の DOM query と error formatting を集約する薄い helper。
 * 見つからない element は起動失敗として throw し、UI state や cleanup lifecycle は caller module に残す。
 */
type HtmlElementConstructor<T extends HTMLElement> = {
    new (): T;
};

export function requireElement<T extends HTMLElement>(
    id: string,
    elementConstructor: HtmlElementConstructor<T>,
): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    if (!(element instanceof elementConstructor)) {
        throw new Error(`Element ${id} is not ${elementConstructor.name}.`);
    }
    return element;
}

export function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
