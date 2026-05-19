import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type {
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import {
    buildSincroAppSettingsRelatedSnapshotPayload,
    type SincroAppSettingsRelatedSnapshotPayload,
} from "./sincroAppSettingsRelatedSnapshotBuilder";

type SincroAppSettingsRelatedPayloadCacheParams = {
    dialogManager: SincroAppDialogFacade;
    buildStartupSettingsStatus: (
        currentSettings: SincroAppSettingsSnapshot,
    ) => SincroAppStartupSettingsStatus;
};

// settings 関連イベントの連続 emit 中だけ snapshot payload を共有する短命 cache。
// AppController 本体から cache depth と破棄条件を分離し、stale snapshot を残さない責務を閉じ込める。
export class SincroAppSettingsRelatedPayloadCache {
    private readonly params: SincroAppSettingsRelatedPayloadCacheParams;
    private payload: SincroAppSettingsRelatedSnapshotPayload | undefined;
    private depth: number = 0;

    constructor(params: SincroAppSettingsRelatedPayloadCacheParams) {
        this.params = params;
    }

    build(settings?: SincroAppSettingsSnapshot): SincroAppSettingsRelatedSnapshotPayload {
        if (this.payload) {
            return this.payload;
        }
        return buildSincroAppSettingsRelatedSnapshotPayload({
            dialogManager: this.params.dialogManager,
            settings,
            buildStartupSettingsStatus: this.params.buildStartupSettingsStatus,
        });
    }

    withCache<T>(run: () => T, settings?: SincroAppSettingsSnapshot): T {
        const shouldSeedCache = this.depth === 0;
        this.depth += 1;
        if (shouldSeedCache) {
            this.payload = buildSincroAppSettingsRelatedSnapshotPayload({
                dialogManager: this.params.dialogManager,
                settings,
                buildStartupSettingsStatus: this.params.buildStartupSettingsStatus,
            });
        }
        try {
            return run();
        } finally {
            this.depth -= 1;
            if (this.depth === 0) {
                this.payload = undefined;
            }
        }
    }
}
