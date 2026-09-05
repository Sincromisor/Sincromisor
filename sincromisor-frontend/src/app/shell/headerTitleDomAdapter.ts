// dialog 外のヘッダー文言更新を小さな DOM adapter に隔離する。
// DialogBridgeDomAdapter は HTMLDialogElement の platform boundary 専用に保つ。
export class HeaderTitleDomAdapter {
    /** ヘッダーが配置済みの場合だけ、補正済みの設定題名を表示する。 */
    setHeaderTitle(text: string): void {
        const header = document.querySelector("div#sincroHeaderBox__text");
        if (header instanceof HTMLDivElement) {
            header.innerText = text;
        }
    }
}
