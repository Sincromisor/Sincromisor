/**
 * 独立モックの開始案内だけを扱う。選択はこのページ内に閉じ、実アプリの設定や機器には触れない。
 * 見た目と会話例の切り替えは styles.css が標準ラジオボタンの状態を参照する。
 */
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
    throw new Error("Home mock controls are missing");
}

// 標準 dialog にフォーカス制限・Escape・閉じた後のフォーカス復帰を委ねる。
for (const button of document.querySelectorAll("[data-start]")) {
    button.addEventListener("click", () => {
        dialogTitle.textContent = sincroChoice.checked
            ? "キャラクターになる"
            : "キャラクターと話す";
        modeHint.textContent = sincroChoice.checked ? "sincro" : "chat";
        dialog.showModal();
    });
}

// 下部の体験紹介から戻るときも、上部の選択とプレビューを一致させる。
for (const mode of ["chat", "sincro"]) {
    document.querySelector(`[data-choose="${mode}"]`)?.addEventListener("click", () => {
        const choice = document.querySelector(`input[value="${mode}"]`);
        if (!(choice instanceof HTMLInputElement)) return;
        choice.checked = true;
        choice.focus({ preventScroll: true });
        document.querySelector("#main")?.scrollIntoView();
    });
}
