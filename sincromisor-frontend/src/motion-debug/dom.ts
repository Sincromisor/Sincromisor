export function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    return element as T;
}

export function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
