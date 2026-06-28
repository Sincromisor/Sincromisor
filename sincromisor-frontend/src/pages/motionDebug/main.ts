/**
 * motion-debug Vite entry point。
 * DOMContentLoaded 後に MotionDebugApp を生成するだけに留め、debug API、camera、replay、scene lifecycle は各 runtime module が所有する。
 */
import { MotionDebugApp } from "./motionDebugApp";
import "./styles.css";

window.addEventListener("DOMContentLoaded", () => {
    new MotionDebugApp();
});
