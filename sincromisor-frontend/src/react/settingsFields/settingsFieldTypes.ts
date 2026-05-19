import type { CSSProperties } from "react";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../../app/controller";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../ts/mediaDevices/sincroMediaDeviceService";

export type FieldContainerProps = {
    className?: string;
    style?: CSSProperties;
};

export type SettingsFieldProps = FieldContainerProps & {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
};

export type DeviceFieldBaseProps = FieldContainerProps & {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    uiHints: SincroAppSettingsUiHints;
    snapshot: SincroMediaDeviceSnapshot;
    selection: SincroMediaDeviceSelectionState;
    onApplySettings: ApplySettingsFn;
};

export type ToggleGroupProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onApplySettings: ApplySettingsFn;
    gridDensity?: "compact" | "regular";
    toggleDensity?: "compact" | "regular";
};
