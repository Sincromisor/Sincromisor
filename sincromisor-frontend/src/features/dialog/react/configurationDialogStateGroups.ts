import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import type {
    SincroAppController,
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
} from "../../../app/controller";
import { defaultDialogUiState, defaultDialogVrmUiState } from "./configurationDialogStateDefaults";

export type ConfigurationDialogUiStateSetters = {
    setDialogVrmUiState: Dispatch<SetStateAction<SincroAppDialogVrmUiState>>;
    setDialogUiState: Dispatch<SetStateAction<SincroAppDialogUiState>>;
};

export function useConfigurationDialogUiSnapshots(
    initialController: SincroAppController | undefined,
) {
    const [dialogVrmUiState, setDialogVrmUiState] = useState<SincroAppDialogVrmUiState>(
        initialController?.state.getDialogVrmUiState() ?? defaultDialogVrmUiState,
    );
    const [dialogUiState, setDialogUiState] = useState<SincroAppDialogUiState>(
        initialController?.state.getDialogUiState() ?? defaultDialogUiState,
    );
    return useMemo(
        () => ({
            dialogVrmUiState,
            dialogUiState,
            setDialogVrmUiState,
            setDialogUiState,
        }),
        [dialogVrmUiState, dialogUiState],
    );
}

export function useConfigurationDialogStateSetters(
    dialogState: ReturnType<typeof useConfigurationDialogUiSnapshots>,
): ConfigurationDialogUiStateSetters {
    return useMemo(
        () => ({
            setDialogVrmUiState: dialogState.setDialogVrmUiState,
            setDialogUiState: dialogState.setDialogUiState,
        }),
        [dialogState.setDialogVrmUiState, dialogState.setDialogUiState],
    );
}
