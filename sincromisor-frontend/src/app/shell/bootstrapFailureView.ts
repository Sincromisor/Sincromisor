import "./bootstrapFailureView.css";

/** Reactや操作パネルの読込に依存せず、失敗画面とページ再読込の入口を配置する。 */
export function showBootstrapFailure(mountNode: HTMLElement): void {
    const panel = document.createElement("main");
    panel.className = "sincroBootstrapFailure";
    panel.tabIndex = -1;
    panel.setAttribute("aria-labelledby", "sincroBootstrapFailureTitle");
    const title = document.createElement("h1");
    title.id = "sincroBootstrapFailureTitle";
    title.textContent = "起動に失敗しました";
    const message = document.createElement("p");
    message.textContent =
        "ページを再読み込みしてください。改善しない場合はトップへ戻ってください。";
    const actions = document.createElement("div");
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "再読み込み";
    reload.addEventListener("click", () => window.location.reload());
    const home = document.createElement("a");
    home.href = "/";
    home.textContent = "トップへ戻る";
    actions.append(reload, home);
    panel.append(title, message, actions);
    mountNode.replaceChildren(panel);
    mountNode.inert = false;
    // 操作画面を失った後の移動先を明示し、Tabで回復操作へ進めるようにする。
    panel.focus();
}
