import type { DragEvent, MutableRefObject } from "react";
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

    return {
        handleDialogDragEnter: (event) => {
            handleVrmDragEnter(event, dragDepthRef, setVrmDragOver);
        },
        handleDialogDragOver: (event) => {
            handleVrmDragOver(event, isDragOver, setVrmDragOver);
        },
        handleDialogDragLeave: (event) => {
            handleVrmDragLeave(event, dragDepthRef, setVrmDragOver);
        },
        handleDialogDrop: (event) => {
            handleVrmDrop(event, dragDepthRef, setVrmDragOver, applySelectedVrmFile);
        },
    };
}

function resetDragState(
    dragDepthRef: MutableRefObject<number>,
    setVrmDragOver: (isDragOver: boolean) => void,
): void {
    dragDepthRef.current = 0;
    setVrmDragOver(false);
}

function handleVrmDragEnter(
    event: DragEvent<HTMLFieldSetElement>,
    dragDepthRef: MutableRefObject<number>,
    setVrmDragOver: (isDragOver: boolean) => void,
): void {
    if (!hasFileDragPayload(event.dataTransfer)) {
        return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setVrmDragOver(true);
}

function handleVrmDragOver(
    event: DragEvent<HTMLFieldSetElement>,
    isDragOver: boolean,
    setVrmDragOver: (isDragOver: boolean) => void,
): void {
    if (!hasFileDragPayload(event.dataTransfer)) {
        return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragOver) {
        setVrmDragOver(true);
    }
}

function handleVrmDragLeave(
    event: DragEvent<HTMLFieldSetElement>,
    dragDepthRef: MutableRefObject<number>,
    setVrmDragOver: (isDragOver: boolean) => void,
): void {
    if (!hasFileDragPayload(event.dataTransfer)) {
        return;
    }
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
        setVrmDragOver(false);
    }
}

function handleVrmDrop(
    event: DragEvent<HTMLFieldSetElement>,
    dragDepthRef: MutableRefObject<number>,
    setVrmDragOver: (isDragOver: boolean) => void,
    applySelectedVrmFile: (file: File) => void,
): void {
    if (!hasFileDragPayload(event.dataTransfer)) {
        return;
    }
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    resetDragState(dragDepthRef, setVrmDragOver);
    if (file) {
        applySelectedVrmFile(file);
    }
}
