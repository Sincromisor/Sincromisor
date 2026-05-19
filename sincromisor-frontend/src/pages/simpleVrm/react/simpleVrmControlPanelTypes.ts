import type { useSimpleVrmPanelState } from "./useSimpleVrmPanelState";

export type SimpleVrmPanelState = ReturnType<typeof useSimpleVrmPanelState>;

export type SimpleVrmControlPanelPageProps = {
    panelState: SimpleVrmPanelState;
};
