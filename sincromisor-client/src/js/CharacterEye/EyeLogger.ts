export class CharacterEyeLogger {
    faceXLog: HTMLElement | null;
    faceYLog: HTMLElement | null;
    facing: HTMLElement | null;
    characterEyeStatus: HTMLElement | null;

    constructor() {
        this.faceXLog = document.querySelector('dd#faceX');
        this.faceYLog = document.querySelector('dd#faceY');
        this.facing = document.querySelector('dd#facing');
        this.characterEyeStatus = document.querySelector('dd#gloriaEyeStatus');
    }

    updateFaceXLog(value: number){
        if(this.faceXLog){
            this.faceXLog.textContent = `${value}`;
        }
    }

    updateFaceYLog(value: number){
        if(this.faceYLog){
            this.faceYLog.textContent = `${value}`;
        }
    }

    updateFacing(value: number){
        if (this.facing){
            this.facing.textContent = `${value}`;
        }
    }

    updateCharacterEyeStatus(watching:boolean){
        if (!this.characterEyeStatus){
            return;
        }
        if (watching){
            this.characterEyeStatus.innerText = 'みてる';
        } else {
            this.characterEyeStatus.innerText = 'みてない';
        }
    }
}
