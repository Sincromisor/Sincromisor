export type SincroMediaDeviceKind = "audioinput" | "videoinput";

export type SincroMediaDeviceOption = {
    kind: SincroMediaDeviceKind;
    deviceId: string;
    groupId: string | undefined;
    label: string;
    rawLabel: string;
    fallbackLabel: string;
    isLabelResolved: boolean;
};

export type SincroMediaDeviceSelectionState = {
    selectedDeviceId: string | undefined;
    isSelected: boolean;
    availabilityKnown: boolean;
    isAvailable: boolean;
    matchedDevice: SincroMediaDeviceOption | undefined;
};

export type SincroMediaDeviceSnapshot = {
    isSupported: boolean;
    audioInputs: SincroMediaDeviceOption[];
    videoInputs: SincroMediaDeviceOption[];
    labelsResolved: boolean;
    isRefreshing: boolean;
    refreshError: string | undefined;
    lastUpdatedAt: number | undefined;
};

type SincroMediaDeviceListener = (snapshot: SincroMediaDeviceSnapshot) => void;

const EMPTY_SNAPSHOT: SincroMediaDeviceSnapshot = {
    isSupported: typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices,
    audioInputs: [],
    videoInputs: [],
    labelsResolved: false,
    isRefreshing: false,
    refreshError: undefined,
    lastUpdatedAt: undefined,
};

// ブラウザの mediaDevices を UI から独立して扱う singleton service。
// enumerate / devicechange / 選択済みIDの有効性確認をここへ集約する。
export class SincroMediaDeviceService {
    private static instance: SincroMediaDeviceService | undefined;

    private readonly listeners = new Set<SincroMediaDeviceListener>();
    private snapshot: SincroMediaDeviceSnapshot = EMPTY_SNAPSHOT;
    private refreshPromise: Promise<SincroMediaDeviceSnapshot> | undefined;
    private isWatching = false;
    private readonly handleDeviceChange = (): void => {
        void this.refresh();
    };

    static getInstance(): SincroMediaDeviceService {
        if (!SincroMediaDeviceService.instance) {
            SincroMediaDeviceService.instance = new SincroMediaDeviceService();
        }
        return SincroMediaDeviceService.instance;
    }

    private constructor() {}

    getSnapshot(): SincroMediaDeviceSnapshot {
        return {
            ...this.snapshot,
            audioInputs: [...this.snapshot.audioInputs],
            videoInputs: [...this.snapshot.videoInputs],
        };
    }

    subscribe(listener: SincroMediaDeviceListener): () => void {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.listeners.delete(listener);
        };
    }

    start(): void {
        if (this.isWatching || !this.snapshot.isSupported || !navigator.mediaDevices) {
            return;
        }
        navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
        this.isWatching = true;
    }

    stop(): void {
        if (!this.isWatching || !navigator.mediaDevices) {
            return;
        }
        navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange);
        this.isWatching = false;
    }

    async refresh(): Promise<SincroMediaDeviceSnapshot> {
        if (!this.snapshot.isSupported || !navigator.mediaDevices?.enumerateDevices) {
            return this.getSnapshot();
        }
        if (this.refreshPromise) {
            return this.refreshPromise;
        }
        this.patchSnapshot({
            isRefreshing: true,
            refreshError: undefined,
        });
        this.refreshPromise = navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
                const normalized = normalizeMediaDeviceSnapshot(devices);
                this.patchSnapshot({
                    ...normalized,
                    isRefreshing: false,
                    refreshError: undefined,
                    lastUpdatedAt: Date.now(),
                });
                return this.getSnapshot();
            })
            .catch((error: unknown) => {
                this.patchSnapshot({
                    isRefreshing: false,
                    refreshError: error instanceof Error ? error.message : String(error),
                });
                return this.getSnapshot();
            })
            .finally(() => {
                this.refreshPromise = undefined;
            });
        return this.refreshPromise;
    }

    getSelectionState(
        kind: SincroMediaDeviceKind,
        selectedDeviceId: string | undefined,
    ): SincroMediaDeviceSelectionState {
        const options =
            kind === "audioinput" ? this.snapshot.audioInputs : this.snapshot.videoInputs;
        const matchedDevice = resolveSelectedMediaDevice(options, selectedDeviceId);
        const availabilityKnown =
            this.snapshot.lastUpdatedAt !== undefined || this.snapshot.refreshError !== undefined;
        return {
            selectedDeviceId,
            isSelected: selectedDeviceId !== undefined,
            availabilityKnown,
            isAvailable: !!matchedDevice,
            matchedDevice,
        };
    }

    private patchSnapshot(partial: Partial<SincroMediaDeviceSnapshot>): void {
        this.snapshot = {
            ...this.snapshot,
            ...partial,
            audioInputs: partial.audioInputs ?? this.snapshot.audioInputs,
            videoInputs: partial.videoInputs ?? this.snapshot.videoInputs,
        };
        const nextSnapshot = this.getSnapshot();
        this.listeners.forEach((listener) => {
            listener(nextSnapshot);
        });
    }
}

export function buildSincroMediaDeviceSelections(params: {
    snapshot: SincroMediaDeviceSnapshot;
    audioInputDeviceId?: string | undefined;
    videoInputDeviceId?: string | undefined;
}): {
    audioInput: SincroMediaDeviceSelectionState;
    videoInput: SincroMediaDeviceSelectionState;
} {
    const availabilityKnown =
        params.snapshot.lastUpdatedAt !== undefined || params.snapshot.refreshError !== undefined;
    return {
        audioInput: resolveMediaDeviceSelection(
            params.snapshot.audioInputs,
            normalizeSelectedMediaDeviceId(params.audioInputDeviceId),
            availabilityKnown,
        ),
        videoInput: resolveMediaDeviceSelection(
            params.snapshot.videoInputs,
            normalizeSelectedMediaDeviceId(params.videoInputDeviceId),
            availabilityKnown,
        ),
    };
}

function resolveMediaDeviceSelection(
    options: SincroMediaDeviceOption[],
    selectedDeviceId: string | undefined,
    availabilityKnown: boolean,
): SincroMediaDeviceSelectionState {
    const matchedDevice = resolveSelectedMediaDevice(options, selectedDeviceId);
    return {
        selectedDeviceId,
        isSelected: selectedDeviceId !== undefined,
        availabilityKnown,
        isAvailable: !!matchedDevice,
        matchedDevice,
    };
}

function resolveSelectedMediaDevice(
    options: SincroMediaDeviceOption[],
    selectedDeviceId: string | undefined,
): SincroMediaDeviceOption | undefined {
    if (selectedDeviceId === undefined) {
        return undefined;
    }
    return options.find((option) => option.deviceId === selectedDeviceId);
}

function normalizeSelectedMediaDeviceId(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? value : undefined;
}

function normalizeMediaDeviceSnapshot(
    devices: MediaDeviceInfo[],
): Pick<SincroMediaDeviceSnapshot, "audioInputs" | "videoInputs" | "labelsResolved"> {
    let audioInputCount = 0;
    let videoInputCount = 0;
    const audioInputs: SincroMediaDeviceOption[] = [];
    const videoInputs: SincroMediaDeviceOption[] = [];

    devices.forEach((device) => {
        if (device.kind !== "audioinput" && device.kind !== "videoinput") {
            return;
        }
        if (!device.deviceId) {
            return;
        }
        if (device.kind === "audioinput") {
            audioInputCount += 1;
        } else {
            videoInputCount += 1;
        }
        const index = device.kind === "audioinput" ? audioInputCount : videoInputCount;
        const option = normalizeMediaDeviceOption(
            device as MediaDeviceInfo & { kind: SincroMediaDeviceKind },
            index,
        );
        if (device.kind === "audioinput") {
            audioInputs.push(option);
            return;
        }
        videoInputs.push(option);
    });

    return {
        audioInputs,
        videoInputs,
        labelsResolved: [...audioInputs, ...videoInputs].some((option) => option.isLabelResolved),
    };
}

function normalizeMediaDeviceOption(
    device: MediaDeviceInfo & { kind: SincroMediaDeviceKind },
    index: number,
): SincroMediaDeviceOption {
    const fallbackLabel = buildMediaDeviceFallbackLabel(device.kind, index);
    const rawLabel = device.label ?? "";
    const label = rawLabel.trim() || fallbackLabel;
    return {
        kind: device.kind,
        deviceId: device.deviceId,
        groupId: device.groupId.trim().length > 0 ? device.groupId : undefined,
        label,
        rawLabel,
        fallbackLabel,
        isLabelResolved: rawLabel.trim().length > 0,
    };
}

function buildMediaDeviceFallbackLabel(kind: SincroMediaDeviceKind, index: number): string {
    return kind === "audioinput" ? `マイク ${index}` : `カメラ ${index}`;
}
