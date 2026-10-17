export type SincroMediaDeviceKind = "audioinput" | "videoinput";

/** 列挙した入力機器。発行後は変更せず次の列挙結果で置き換える。 */
export type SincroMediaDeviceOption = Readonly<{
    kind: SincroMediaDeviceKind;
    deviceId: string;
    groupId: string | undefined;
    label: string;
    rawLabel: string;
    fallbackLabel: string;
    isLabelResolved: boolean;
}>;

export type SincroMediaDeviceSelectionState = {
    selectedDeviceId: string | undefined;
    isSelected: boolean;
    availabilityKnown: boolean;
    isAvailable: boolean;
    matchedDevice: SincroMediaDeviceOption | undefined;
};

/** 一覧と取得状態をまとめた読み取り専用値。更新がない間は同じ参照を返す。 */
export type SincroMediaDeviceSnapshot = Readonly<{
    isSupported: boolean;
    audioInputs: readonly SincroMediaDeviceOption[];
    videoInputs: readonly SincroMediaDeviceOption[];
    labelsResolved: boolean;
    isRefreshing: boolean;
    refreshError: string | undefined;
    lastUpdatedAt: number | undefined;
}>;

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

    /** UIの外部ストア購読へ現在値を渡す。取得による複製や通知はしない。 */
    getSnapshot(): SincroMediaDeviceSnapshot {
        return this.snapshot;
    }

    /** 登録時に現在値を通知し、解除は当該購読だけを外す。 */
    subscribe(listener: SincroMediaDeviceListener): () => void {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** 共有サービスがdevicechange監視を所有し、複数の開始要求をまとめる。 */
    start(): void {
        if (this.isWatching || !this.snapshot.isSupported || !navigator.mediaDevices) {
            return;
        }
        navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
        this.isWatching = true;
    }

    /** 監視所有者による停止。個々の画面の購読解除からは呼ばない。 */
    stop(): void {
        if (!this.isWatching || !navigator.mediaDevices) {
            return;
        }
        navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange);
        this.isWatching = false;
    }

    /** 同時取得を共有する。失敗時は一覧を保ち、エラーと取得状態だけを更新する。 */
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

    // 一覧は列挙成功時だけ置き換え、取得中・失敗時も過去の値を変更しない。
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
    options: readonly SincroMediaDeviceOption[],
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
    options: readonly SincroMediaDeviceOption[],
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
        const option = normalizeMediaDeviceOption(device, device.kind, index);
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
    device: MediaDeviceInfo,
    kind: SincroMediaDeviceKind,
    index: number,
): SincroMediaDeviceOption {
    const fallbackLabel = buildMediaDeviceFallbackLabel(kind, index);
    const rawLabel = device.label ?? "";
    const normalizedLabel = rawLabel.trim();
    const label = normalizedLabel === "" ? fallbackLabel : normalizedLabel;
    return {
        kind,
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
