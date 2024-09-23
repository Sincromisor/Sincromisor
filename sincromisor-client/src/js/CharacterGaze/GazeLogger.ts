export class CharacterGazeLogger {
    faceXLog: HTMLElement | null;
    faceYLog: HTMLElement | null;
    facing: HTMLElement | null;
    characterGazeStatus: HTMLElement | null;

    constructor() {
        this.faceXLog = document.querySelector('dd#faceX');
        this.faceYLog = document.querySelector('dd#faceY');
        this.facing = document.querySelector('dd#facing');
        this.characterGazeStatus = document.querySelector('dd#characterGazeStatus');
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
        if (!this.characterGazeStatus){
            return;
        }
        if (watching){
            this.characterGazeStatus.innerText = 'みてる';
        } else {
            this.characterGazeStatus.innerText = 'みてない';
        }
    }
}
