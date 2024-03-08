import { SincroController } from "./SincroController";
import { GloriaGlass } from "./GloriaGlass.js";

export class SincroGlassController extends SincroController{
        constructor() {
            super();
            this.gloriaChan = new GloriaGlass();
        }
}
