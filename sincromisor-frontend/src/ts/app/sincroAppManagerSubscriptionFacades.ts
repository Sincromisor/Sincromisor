import type { SincroAppDialogFacade } from "./sincroAppDialogFacade";

// 購読 binder helper が依存する最小 facade 群。
// concrete manager / service class への依存を減らし、helper の再利用性とテスト容易性を上げる。
export type SincroAppChatSubscriptionFacade = Pick<
    import("../ui/chatMessageService").ChatMessageService,
    "subscribe"
>;

export type SincroAppDebugSubscriptionFacade = Pick<
    import("../ui/debugConsoleManager").DebugConsoleManager,
    "subscribe"
>;

export type SincroAppTalkSubscriptionFacade = Pick<
    import("../rtc/talkManager").TalkManager,
    "subscribe"
>;

export type SincroAppPopSubscriptionFacade = Pick<
    import("../ui/popMessageService").PopMessageService,
    "subscribeDialogPop"
>;

// dialog 購読は既に facade 境界を持っているため、それを再利用する。
export type SincroAppDialogSubscriptionFacade = Pick<
    SincroAppDialogFacade,
    "subscribeSettingsChange" | "subscribeDialogUiState" | "subscribeVrmUiState"
>;
