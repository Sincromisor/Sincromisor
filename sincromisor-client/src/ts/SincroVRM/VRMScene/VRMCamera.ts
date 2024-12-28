import { PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export class VRMCamera {
    public readonly camera: PerspectiveCamera;

    constructor(targetElement: HTMLElement) {
        const CAMERA_FOV = 30.0;
        const CAMERA_Z = 1.2;
        this.camera = new PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 20.0);
        this.camera.position.set(0.0, 1.45, CAMERA_Z);
        const controls = new OrbitControls( this.camera, targetElement );
        controls.screenSpacePanning = true;
        controls.target.set( 0.0, 1.4, 0.0 );
        controls.update();
    }
}
