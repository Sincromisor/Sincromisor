import type { useSincroPanelState } from "./useSincroPanelState";

/** 共通パネルの購読値と操作を、各カテゴリへ同じ形で渡す。 */
export type SincroPanelState = ReturnType<typeof useSincroPanelState>;

/** 各カテゴリは状態を所有せず、共通フックの読み取り値と操作を受け取る。 */
export type SincroControlPanelPageProps = {
    panelState: SincroPanelState;
};
