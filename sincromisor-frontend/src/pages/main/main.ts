/**
 * トップの体験紹介からラジオ選択へ戻る操作を扱う。
 * 会話例はCSSで切り替え、正式トップの開始はHTMLフォームによるページ遷移に委ねる。
 */
// 下部の体験紹介から戻るときも、上部の選択と会話例を一致させる。
for (const mode of ["chat", "sincro"]) {
    document.querySelector(`[data-choose="${mode}"]`)?.addEventListener("click", () => {
        const choice = document.querySelector(`input[value="${mode}"]`);
        if (!(choice instanceof HTMLInputElement)) return;
        choice.checked = true;
        choice.dispatchEvent(new Event("change", { bubbles: true }));
        choice.focus({ preventScroll: true });
        document.querySelector("#main")?.scrollIntoView();
    });
}

// 診断を閉じても現在の選択を見失わず、通常体験へ戻る操作も同じラジオ群で扱う。
const diagnosticSummary = document.querySelector(".mode-diagnostics summary span");
for (const choice of document.querySelectorAll<HTMLInputElement>('input[name="talkMode"]')) {
    choice.addEventListener("change", () => {
        if (!diagnosticSummary) return;
        const label = choice.closest(".mode-choice")?.querySelector("strong")?.textContent;
        diagnosticSummary.textContent = ["echo", "playback"].includes(choice.value)
            ? `：${label}`
            : "";
    });
}
