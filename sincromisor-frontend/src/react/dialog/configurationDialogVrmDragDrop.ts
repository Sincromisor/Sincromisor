import type { DragEvent } from "react";
import { useRef } from "react";

type ConfigurationDialogVrmDragDropOptions = {
    isDragOver: boolean;
    applySelectedVrmFile: (file: File) => void;
    setVrmDragOver: (isDragOver: boolean) => void;
};

type ConfigurationDialogVrmDragDrop = {
    handleDialogDragEnter: (event: DragEvent<HTMLFieldSetElement>) => void;
    handleDialogDragOver: (event: DragEvent<HTMLFieldSetElement>) => void;
    handleDialogDragLeave: (event: DragEvent<HTMLFieldSetElement>) => void;
    handleDialogDrop: (event: DragEvent<HTMLFieldSetElement>) => void;
};

function hasFileDragPayload(dataTransfer: DataTransfer): boolean {
    return Array.from(dataTransfer.types).includes("Files");
}

export function useConfigurationDialogVrmDragDrop({
    isDragOver,
    applySelectedVrmFile,
    setVrmDragOver,
}: ConfigurationDialogVrmDragDropOptions): ConfigurationDialogVrmDragDrop {
    const dragDepthRef = useRef(0);

    const resetDragState = (): void => {
        dragDepthRef.current = 0;
        setVrmDragOver(false);
    };

    const handleDialogDragEnter = (event: DragEvent<HTMLFieldSetElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        dragDepthRef.current += 1;
        setVrmDragOver(true);
    };

    const handleDialogDragOver = (event: DragEvent<HTMLFieldSetElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!isDragOver) {
            setVrmDragOver(true);
        }
    };

    const handleDialogDragLeave = (event: DragEvent<HTMLFieldSetElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
            setVrmDragOver(false);
        }
    };

    const handleDialogDrop = (event: DragEvent<HTMLFieldSetElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        resetDragState();
        if (file) {
            applySelectedVrmFile(file);
        }
    };

    return {
        handleDialogDragEnter,
        handleDialogDragOver,
        handleDialogDragLeave,
        handleDialogDrop,
    };
}
