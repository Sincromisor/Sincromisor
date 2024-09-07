import { SincroGlassController } from "./SincroGlassController.js";

window.onload = () => {
    const sincroController = new SincroGlassController();
    if (window.obsstudio){
        sincroController.autoStart();
    }
}
