import type { SincroAppDialogFacade } from "./SincroAppDialogFacade";

export type SincroAppChatSubscriptionFacade = Pick<
    import("../UI/ChatMessageManager").ChatMessageManager,
    "subscribe"
>;

export type SincroAppDebugSubscriptionFacade = Pick<
    import("../UI/DebugConsoleManager").DebugConsoleManager,
    "subscribe"
>;

export type SincroAppTalkSubscriptionFacade = Pick<
    import("../RTC/TalkManager").TalkManager,
    "subscribe"
>;

export type SincroAppPopSubscriptionFacade = Pick<
    import("../UI/PopManager").PopManager,
    "subscribeDialogPop"
>;

// dialog 購読は既に facade 境界を持っているため、それを再利用する。
export type SincroAppDialogSubscriptionFacade = Pick<
    SincroAppDialogFacade,
    "subscribeSettingsChange" | "subscribeDialogUiState" | "subscribeVrmUiState"
>;
