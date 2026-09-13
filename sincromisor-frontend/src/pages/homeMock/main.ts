import "../main/main";

/** 独立モックだけの開始案内。選択は実アプリへ渡さず、移動先での再設定を案内する。 */
const dialog = document.querySelector("#start-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const modeHint = document.querySelector("#mode-hint");
const sincroChoice = document.querySelector('input[value="sincro"]');

if (
    !(dialog instanceof HTMLDialogElement) ||
    !(sincroChoice instanceof HTMLInputElement) ||
    !dialogTitle ||
    !modeHint
) {
    throw new Error("Home page controls are missing");
}

// 標準 dialog にフォーカス制限・Escape・閉じた後のフォーカス復帰を委ねる。
for (const button of document.querySelectorAll("[data-start]")) {
    button.addEventListener("click", () => {
        dialogTitle.textContent = sincroChoice.checked
            ? "キャラクターになる"
            : "キャラクターと話す";
        const mode = sincroChoice.checked ? "sincro" : "chat";
        modeHint.textContent = mode;
        dialog.showModal();
    });
}
