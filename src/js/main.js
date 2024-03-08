import { SincroController } from "./SincroController.js";

window.onload = () => {
    const sincroController = new SincroController();
    if (window.obsstudio){
        sincroController.autoStart();
    }
}
