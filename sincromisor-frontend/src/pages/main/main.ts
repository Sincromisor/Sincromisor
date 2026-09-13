/**
 * 正式トップと独立モックの体験選択・開始案内を扱う。機器やRTCは起動しない。
 * 正式トップだけが持つ開始リンクへ会話モードを渡し、設定の適用は移動先に委ねる。
 * 見た目と会話例の切り替えは styles.css が標準ラジオボタンの状態を参照する。
 */
const dialog = document.querySelector("#start-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const experienceLink = document.querySelector("#experience-link");
const modeHint = document.querySelector("#mode-hint");
const sincroChoice = document.querySelector('input[value="sincro"]');

if (
    !(dialog instanceof HTMLDialogElement) ||
    !(sincroChoice instanceof HTMLInputElement) ||
    !dialogTitle
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
        // 独立モックは再設定の案内だけを表示し、正式トップは選択をURLで引き継ぐ。
        if (modeHint) modeHint.textContent = mode;
        if (experienceLink instanceof HTMLAnchorElement) {
            experienceLink.href = `/simple-vrm/?talkMode=${mode}`;
        }
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
