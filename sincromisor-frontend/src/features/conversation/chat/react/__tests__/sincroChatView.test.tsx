import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ChatMessageService } from "../../model/chatMessageService";
import { SincroChatView } from "../sincroChatView";

vi.mock("../../../../../app/controller", () => ({
    SincroAppController: {
        getCurrent: () => ({ chat: ChatMessageService.getService() }),
    },
}));
vi.mock("../../../../../app/react/subscribeActiveSincroAppEvents", () => ({
    subscribeActiveSincroAppEvents: vi.fn(),
}));

it("DOMなしで履歴を保持し、同一ID更新・件数制限・文字列表示・アイコンを初期描画へ反映する", () => {
    const service = ChatMessageService.getService();
    for (let i = 0; i < 31; i++) service.writeSystemMessage(`履歴${i}`);
    expect(service.getMessageViewSnapshot()).toHaveLength(30);
    const latest = service.getMessageViewSnapshot()[0].message;
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.writeMessage({ ...latest, message: "<b>更新</b>" });
    expect(service.getMessageViewSnapshot()).toHaveLength(30);
    expect(listener).toHaveBeenCalledOnce();
    service.setSystemIcon("/updated.webp");
    let markup = renderToStaticMarkup(<SincroChatView />);
    expect(markup).toContain("&lt;b&gt;更新&lt;/b&gt;");
    expect(markup).not.toContain("履歴0<");
    expect(markup).toContain("/updated.webp");
    service.writeSystemMessage("<b>許可</b>", true);
    service.writeUnknownUserMessage("<b>ユーザー</b>", true);
    service.writeErrorMessage("同じエラー");
    service.writeErrorMessage("同じエラー");
    service.writeResetMessage("リセット");
    markup = renderToStaticMarkup(<SincroChatView />);
    expect(markup).toContain("<b>許可</b>");
    expect(markup).toContain("&lt;b&gt;ユーザー&lt;/b&gt;");
    expect(markup.match(/同じエラー/g)).toHaveLength(1);
    expect(markup).toContain("リセット");
    unsubscribe();
    listener.mockClear();
    service.writeSystemMessage("購読解除後");
    expect(listener).not.toHaveBeenCalled();
});
