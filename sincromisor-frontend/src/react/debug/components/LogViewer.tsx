type LogViewerProps = {
    title: string;
    value: string;
    id: string;
};

export function LogViewer({ title, value, id }: LogViewerProps) {
    return (
        <article className="logViewer">
            <h4>{title}</h4>
            <pre id={id}>{value}</pre>
        </article>
    );
}
