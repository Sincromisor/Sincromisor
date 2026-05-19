import type { SincroAppDialogFacade } from "./sincroAppDialogFacade";

// 購読 binder helper が依存する最小 facade 群。
// concrete manager / service class への依存を減らし、helper の再利用性とテスト容易性を上げる。
export type SincroAppChatSubscriptionFacade = Pick<
    import("../../features/conversation/chat/model/chatMessageService").ChatMessageService,
    "subscribe"
>;

export type SincroAppDebugSubscriptionFacade = Pick<
    import("../../features/debug/model/debugConsoleManager").DebugConsoleManager,
    "subscribe"
>;

export type SincroAppTalkSubscriptionFacade = Pick<
    import("../../features/conversation/talk/talkManager").TalkManager,
    "subscribe"
>;

export type SincroAppPopSubscriptionFacade = Pick<
    import("../../features/dialog/model/popMessageService").PopMessageService,
    "subscribeDialogPop"
>;

// dialog 購読は既に facade 境界を持っているため、それを再利用する。
export type SincroAppDialogSubscriptionFacade = Pick<
    SincroAppDialogFacade,
    "subscribeSettingsChange" | "subscribeDialogUiState" | "subscribeVrmUiState"
>;
