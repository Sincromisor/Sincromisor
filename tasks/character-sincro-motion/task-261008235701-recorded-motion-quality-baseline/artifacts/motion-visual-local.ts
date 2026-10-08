import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Color,
} from "three";
import { applyFullNormalizedPoseApplication } from "./character/vrmCharacter/normalizedPoseWriter";
/** 非公開の保存済み最終姿勢を本番writerで適用し、原動画の対応候補時刻と並べる目視用入口。 */
export async function show(fixture: string, relativeTimeMs: number) {
  document.body.innerHTML = "";
  document.body.style.cssText =
    "background:#e7e9ed;color:#16223a;font:18px sans-serif;margin:20px";
  const title = document.createElement("h3");
  title.textContent =
    fixture +
    " / 動画時刻 " +
    relativeTimeMs +
    " ms（記録のmediaTimeMsと照合）";
  document.body.append(title);
  const row = document.createElement("div");
  row.style.display = "flex";
  document.body.append(row);
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = URL.createObjectURL(
    await (await fetch(`http://127.0.0.1:8878/${fixture}.webm`)).blob(),
  );
  video.muted = true;
  video.style.width = "400px";
  row.append(video);
  await new Promise<void>((resolve) => {
    video.onloadeddata = () => resolve();
  });
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = relativeTimeMs / 1000;
  });
  if (Math.abs(video.currentTime * 1000 - relativeTimeMs) > 1)
    throw Error("動画シーク不一致");
  for (const label of ["head", "candidate"]) {
    const data = await (
      await fetch(`http://127.0.0.1:8878/${label}-${fixture}.json`)
    ).json();
    const time = relativeTimeMs;
    const sample = data.samples.reduce((a: any, b: any) =>
      Math.abs(a.mediaTimeMs - time) < Math.abs(b.mediaTimeMs - time) ? a : b,
    );
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const { userData } = await loader.loadAsync("/characters/default.vrm");
    const vrm = userData.vrm;
    const scene = new Scene();
    scene.background = new Color("#d4dce5");
    scene.add(vrm.scene, new AmbientLight(0xffffff, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(1, 2, 3);
    scene.add(light);
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.25, 3);
    camera.lookAt(0, 1.1, 0);
    const renderer = new WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(400, 400);
    const cell = document.createElement("div");
    cell.textContent = `${label} / ${sample.mediaTimeMs.toFixed(1)} ms`;
    cell.append(renderer.domElement);
    row.append(cell);
    applyFullNormalizedPoseApplication(vrm, sample.finalPose);
    vrm.update(0);
    renderer.render(scene, camera);
  }
}
