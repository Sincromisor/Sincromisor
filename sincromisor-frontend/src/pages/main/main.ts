/**
 * 正式トップと独立モックの体験紹介からラジオ選択へ戻る操作を共用する。
 * 会話例はCSSで切り替え、正式トップの開始はHTMLフォームによるページ遷移に委ねる。
 */
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
