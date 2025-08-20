import { PopManager } from "./PopManager";

export class DialogManager {
    private static instance: DialogManager
    static vrmUrl: string = '/characters/default.vrm';

    static getManager(): DialogManager {
        if (!DialogManager.instance) {
            DialogManager.instance = new DialogManager();
        }
        return DialogManager.instance;
    }

    private constructor() {
        this.setMiscEvent();
        this.setDragAndDropVrmEvent();
        this.setUploadVrmEvent();
        this.updateTitleText();
        this.showDialog();
        this.loadVrmFile().then(() => {
            console.log('VRM file loaded.')
        }).catch((error) => {
            console.error('VRM file load failed.', error);
        });
    }

    showDialog(): void {
        const dialog = this.getDialogElement()
        dialog.addEventListener("keydown", (e) => {
            if (e.key == "Escape") {
                this.closeDialog();
            }
        });
        dialog.showModal();
    }

    closeDialog(): void {
        this.getDialogElement().close();
    }

    private getDialogElement(): HTMLDialogElement {
        const e: HTMLDialogElement | null = document.querySelector('dialog#configurationDialog');
        if (e == null) {
            throw 'dialog#configurationDialog is not found.'
        }
        return e;
    }

    talkMode(): string {
        const eC: HTMLSelectElement | null = document.querySelector('select#talkModeSelector');
        if (eC == null) { return 'chat'; }
        return eC?.value;
    }

    enableCharacter(): boolean {
        const eC: HTMLInputElement | null = document.querySelector('input#enableCharacter');
        if (eC == null) { return false; }
        return eC.checked;
    }

    enableTalk(): boolean {
        const eC: HTMLInputElement | null = document.querySelector('input#enableTalk');
        if (eC == null) { return false; }
        return eC.checked;
    }

    enableCharacterGaze(): boolean {
        const eC: HTMLInputElement | null = document.querySelector("input#enableCharacterGaze");
        if (eC == null) { return false; }
        if (eC.checked) {
            return true;
        }
        return false;
    }

    enableAutoMute(): boolean {
        const eC: HTMLInputElement | null = document.querySelector('input#enableAutoMute');
        if (eC == null) { return false; }
        return eC.checked;
    }

    enableInspector(): boolean {
        const eC: HTMLInputElement | null = document.querySelector('input#enableInspector');
        if (eC == null) { return false; }
        return eC.checked;
    }

    enableVR(): boolean {
        const eC: HTMLInputElement | null = document.querySelector('input#enableVR');
        if (eC == null) { return false; }
        return eC.checked;
    }

    private getTitleText(): string {
        const titleInputElement: HTMLInputElement | null = document.querySelector("input#titleText");
        if (titleInputElement && titleInputElement.value) {
            return titleInputElement.value;
        }
        return "Sincromisor";
    }

    updateTitleText(): void {
        const headerElement: HTMLDivElement | null = document.querySelector("div#sincroHeaderBox__text");
        if (!headerElement) {
            return;
        }
        headerElement.innerText = this.getTitleText();
    }

    updateCharacterStatus(available: boolean): void {
        this.updateEnableCharacterStatus(available);
        this.updateEnableCharacterGazeStatus(available);
        this.updateAutoMuteStatus();
    }

    updateUserMediaAvailabilityStatus(available: boolean): void {
        const eC: HTMLButtonElement | null = document.querySelector('button#sincroStart');
        if (!eC) {
            return;
        }
        if (available) {
            eC.disabled = false;
            eC.textContent = 'はじめる';
            this.updateEnableCharacterGazeStatus(true);
            this.updateAutoMuteStatus();
        } else {
            eC.disabled = true;
            eC.textContent = 'マイクが利用できません';
            this.updateEnableCharacterGazeStatus(false);
            this.updateAutoMuteStatus();
        }
    }

    private updateEnableCharacterStatus(available: boolean) {
        const eC: HTMLInputElement | null = document.querySelector('#enableCharacter');
        if (!eC) {
            return;
        }
        if (available) {
            eC.disabled = false;
        } else {
            eC.disabled = true;
            eC.checked = false;
        }
    }

    updateEnableCharacterGazeStatus(available: boolean): void {
        const eC: HTMLInputElement | null = document.querySelector('#enableCharacterGaze');
        if (!eC) {
            return;
        }
        if (available) {
            eC.disabled = false;
        } else {
            eC.disabled = true;
            eC.checked = false;
        }
    }

    updateAutoMuteStatus(): void {
        const eInput: HTMLInputElement | null = document.querySelector('input#enableAutoMute');
        if (!eInput) {
            return;
        }
        if (this.enableCharacterGaze()) {
            eInput.disabled = false;
        } else {
            eInput.disabled = true;
            eInput.checked = false;

        }
    }

    setRTCStartButtonEventListener(startFunction: () => void): void {
        const startBtn: HTMLButtonElement | null = document.querySelector('button#sincroStart');
        if (!startBtn) {
            throw 'button#sincroStart is not found.';
        }
        startBtn.addEventListener('click', startFunction);
    }

    setRTCStopButtonEventListener(stopFunction: () => void): void {
        const startBtn: HTMLButtonElement | null = document.querySelector('button#rtcStop');
        if (!startBtn) {
            throw 'button#sincroStart is not found.';
        }
        startBtn.addEventListener('click', stopFunction);
    }

    private setMiscEvent(): void {
        // 入力されたタイトルに合わせたヘッダの更新
        const titleText: HTMLInputElement | null = document.querySelector("input#titleText");
        if (titleText) {
            titleText.oninput = () => {
                this.updateTitleText();
            }
        }

        // 顔認識の有効/無効化設定と自動ミュート設定の同期
        const enablecharacterGazeBox: HTMLInputElement | null = document.querySelector("input#enableCharacterGaze");
        if (enablecharacterGazeBox) {
            enablecharacterGazeBox.onclick = () => {
                this.updateAutoMuteStatus();
            }
        }
    }

    /* VRMファイルがDrag & Dropされた際のイベントを定義 */
    private setDragAndDropVrmEvent(): void {
        const dropArea: HTMLDialogElement = this.getDialogElement();
        console.log(dropArea);
        dropArea.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            dropArea.classList.add('vrmDragover');
        });
        dropArea.addEventListener('dragleave', (e: DragEvent) => {
            e.preventDefault();
            dropArea.classList.remove('vrmDragover');
        });
        dropArea.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            dropArea.classList.remove('vrmDragover');
            if (e.dataTransfer == null) {
                return;
            }
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                this.updateVrmFile(file);
            }
        });
    }

    /* VRMファイルのアップロードイベントを定義 */
    private setUploadVrmEvent(): void {
        const inputElement: HTMLInputElement | null = document.querySelector('input#vrmFileInput');
        if (!inputElement) { return; }
        inputElement.addEventListener('change', (event: Event) => {
            event.preventDefault();
            if (event.target) {
                const fileElement = event.target as HTMLInputElement;
                const files = fileElement.files;
                if (files) {
                    this.updateVrmFile(files[0]);
                }
            }
        });
    }

    private updateVrmFile(file: File): void {
        const popManager = PopManager.getManager();
        // ファイル名がVRM拡張子であるか確認
        if (!file.name.endsWith('.vrm')) {
            popManager.writeDialogPopError('VRMファイルを選択してください。');
            return;
        }
        const blob = new Blob([file], { type: "application/octet-stream" });
        DialogManager.vrmUrl = URL.createObjectURL(blob);
        this.saveVrmFile(file).then(() => {
            popManager.writeDialogPopMessage('VRMファイルを更新しました。');
            console.log('VRM file updated.', file);
        }).catch((error) => {
            popManager.writeDialogPopError('VRMファイルの更新に失敗しました。');
            console.error('VRM file update failed.', error);
        });
    }

    private async saveVrmFile(file: File): Promise<void> {
        const cache = await caches.open('file-cache');
        const response = new Response(file);
        await cache.put('sincroVrmFile', response);
    }

    private async loadVrmFile(): Promise<void> {
        const cache = await caches.open('file-cache');
        const response: Response | undefined = await cache.match('sincroVrmFile');
        if (!response) {
            return;
        }
        DialogManager.vrmUrl = URL.createObjectURL(await response.blob());
    }
}
