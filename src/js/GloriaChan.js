// https://sandbox.babylonjs.com/
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading";
import { Color4, Color3, Vector3, Quaternion } from "@babylonjs/core/Maths/math";
import { Camera, ArcRotateCamera } from "@babylonjs/core/Cameras";
import { PointLight, ShadowGenerator } from "@babylonjs/core/Lights";
import { NodeMaterial } from "@babylonjs/core/Materials/Node";
import { GLTFFileLoader } from "@babylonjs/loaders/glTF";

SceneLoader.RegisterPlugin(new GLTFFileLoader());

export class GloriaChan {
  constructor() {
    SceneLoader.ShowLoadingScreen = false;
    this.cameraDistance = 0.75;
    this.cameraTarget = new Vector3(0, 1.25, 0);
    this.rigRollValues = [0.0];
    this.rigPitchValues = [0.0];
    this.rigQueueLength = 3;
    this.bodyMorphValue = {
      "rig": 0.0
    };
    this.headMorphValue = {
      "Mayu.l": 0.0,
      "Mayu.r": 0.0,
      "Mouse.A": 0.0,
      "Mouse.I": 0.0,
      "Mouse.U": 0.0,
      "Mouse.E": 0.0,
      "Mouse.O": 0.0,
      "EyeU.l": 0.1,
      "EyeU.r": 0.1,
      "EyeD.l": 0.0,
      "EyeD.r": 0.0
    };
  }

  availabilityCheck(onSuccess = null, onFailure = null) {
    fetch("/characters/gloria.glb", { "method": "HEAD" }).then((res) => {
      if (res.status == 200 && onSuccess != null) {
        onSuccess();
      } else if (onFailure != null) {
        onFailure();
      }
    });
  }

  start(canvasID) {
    this.canvasID = canvasID;
    this.engine = new Engine(this.canvasID, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    //this.scene.performancePriority = ScenePerformancePriority.Aggressive;
    //this.scene.performancePriority = ScenePerformancePriority.Intermediate;
    this.scene.performancePriority = ScenePerformancePriority.BackwardCompatible;
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    this.setupCamera();
    this.setupLight();
    this.loadModel();
    this.customizeScene();
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
    window.addEventListener("resize", () => {
      this.engine.resize();
      this.updateCameraDistance();
    });
  }

  addRigQueue(roll, pitch) {
    this.rigRollValues.push(roll);
    this.rigPitchValues.push(pitch);
    while (this.rigRollValues.length > this.rigQueueLength) {
      this.rigRollValues.shift();
    }
    while (this.rigPitchValues.length > this.rigQueueLength) {
      this.rigPitchValues.shift();
    }
  }

  average(ary) {
    return ary.reduce((e, cur) => { return e + cur }) / ary.length;
  }

  updateEyeClose(value) {
    this.headMorphValue["EyeU.l"] = value;
    this.headMorphValue["EyeD.l"] = value;
    this.headMorphValue["EyeU.r"] = value;
    this.headMorphValue["EyeD.r"] = value;
  }

  updateMouseOpen(vowel, value) {
    this.headMorphValue["Mouse.A"] = 0.0;
    this.headMorphValue["Mouse.I"] = 0.0;
    this.headMorphValue["Mouse.U"] = 0.0;
    this.headMorphValue["Mouse.E"] = 0.0;
    this.headMorphValue["Mouse.O"] = 0.0;
    this.headMorphValue[`Mouse.${vowel}`] = value;
  }

  updateMabataki() {
    if (Math.random() > 0.9993) {
      this.updateEyeClose(0.3);
      setTimeout(() => {
        this.updateEyeClose(0.6);
      }, 30);
      setTimeout(() => {
        this.updateEyeClose(1.0);
      }, 60);
      setTimeout(() => {
        this.updateEyeClose(0.6);
      }, 90);
      setTimeout(() => {
        this.updateEyeClose(0.3);
      }, 120);
      setTimeout(() => {
        this.updateEyeClose(0.0);
      }, 150);
    } else {
      // たまに目を閉じる
      if (Math.random() > 0.99995) {
        this.updateEyeClose(1.0);
      };
    }
  }

  setMouse(vowel, v_time) {
    this.updateMouseOpen(vowel, 0.5);
    setTimeout(() => {
      this.updateMouseOpen(vowel, 0.8);
    }, 30);
    setTimeout(() => {
      this.updateMouseOpen(vowel, 1.0);
    }, 60);
    setTimeout(() => {
      this.updateMouseOpen(vowel, 0.8);
    }, v_time + 10);
    setTimeout(() => {
      this.updateMouseOpen(vowel, 0.5);
    }, v_time + 30);
    setTimeout(() => {
      this.updateMouseOpen(vowel, 0.0);
    }, v_time + 50);
  }

  /* テスト用 */
  randomMouse() {
    const vowel = ["A", "I", "U", "E", "O"][Math.floor(Math.random() * (5))];
    const v_time = 500;
    if (Math.random() > 0.999) {
      this.setMouse(vowel, v_time);
    }
  }

  /* Looking Glass対応など、Sceneに何らかの追加設定を行いたい時に、
     startメソッドの中で実行したいものを記述する。 */
  customizeScene() {
  }

  setupCamera() {
    //const camera = new BABYLON.FreeCamera("camera01", new BABYLON.Vector3(0, 5, 10), this.scene);
    // 第2引数(左右): 0.5 * Math.PI
    // 第3引数(上下): Math.PI / 2
    // 第4引数(距離): 1.5
    this.camera = new ArcRotateCamera("camera01", 0.5 * Math.PI, Math.PI / 2.2, 1.5, this.cameraTarget, this.scene);
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 0.001;

    // ctrl + マウスドラッグの慣性をひかえめに
    this.camera.panningInertia = 0.3;
    // ctrl + マウスドラッグの移動距離に制限を掛ける
    // 1.0未満はなぜか微動だにしなくなるので注意
    this.camera.panningDistanceLimit = 1.4;

    this.camera.wheelDeltaPercentage = 0.005; // カメラの拡大・縮小速度
    this.camera.speed = 0.5; // カメラの回転速度
    this.camera.lowerAlphaLimit = -1; // 左回転の制御
    this.camera.upperAlphaLimit = 4; // 右回転の制御
    this.camera.lowerBetaLimit = 0; // 上からは見れるようにする
    this.camera.upperBetaLimit = 2.2; // 下から覗かれないようにする
    this.camera.lowerRadiusLimit = 0.3; // 近づきすぎないようにする
    this.camera.upperRadiusLimit = 5; // 離れすぎないようにする
    this.camera.fov = 0.95;

    //this.camera.setTarget(new BABYLON.Vector3(0, 1.2, 0));
    this.updateCameraDistance();
    this.camera.attachControl(this.canvasID, true);
    this.canvasID.addEventListener("wheel", (e) => {
      this.cameraDistance += e.deltaY / 1000;
      if (this.cameraDistance > 5.0) {
        this.cameraDistance = 5.0;
      } else if (this.cameraDistance < 0.3) {
        this.cameraDistance = 0.3;
      }
      this.updateCameraDistance();
    });
    /*
    document.querySelector("button#resetCamera").addEventListener("click", () => {
      this.camera.setPosition(new Vector3(0.0, 0.0, 0.0));
      this.camera.alpha = 0.5 * Math.PI;
      this.camera.beta = Math.PI / 2;
      this.camera.update();
    });
    */
  }

  updateCameraDistance() {
    const ratio = this.canvasID.height / this.canvasID.width;
    this.camera.orthoLeft = -this.cameraDistance / 2;
    this.camera.orthoRight = this.cameraDistance / 2;
    this.camera.orthoTop = this.camera.orthoRight * ratio;
    this.camera.orthoBottom = this.camera.orthoLeft * ratio;
  }

  setupLight() {
    //const light = new BABYLON.HemisphericLight("light01", new BABYLON.Vector3(0, 1, 0), this.scene);
    //light.intensity = 0.7;
    this.light = new PointLight("light", new Vector3(3, 14, 10), this.scene);
    this.light.intensity = 2;

    this.light.diffuse = new Color3(1, 1, 0.7);
    // light2.intensity = 1;
    this.light.shadowMinZ = 0.1;
    this.light.shadowMaxZ = 1200;
    // light2.shadowMinZ = 0.1;
    // light2.shadowMaxZ = 1200;

    // 回るライト
    this.scene.registerBeforeRender(() => {
      this.light.position.x = Math.cos(window.performance.now() / 20000) * 40;
      this.light.position.z = Math.sin(window.performance.now() / 20000) * 40;
    });
  }

  loadModel() {
    SceneLoader.Append("/characters/", "gloria.glb", this.scene, (scene) => {
      try {
        this.meshVisibility(scene, false);
        this.setupHeadMorph(scene);
        this.setupBodyMorph(scene);
        this.setupBone(scene);
        this.setupMaterial("Dress", "/characters/dressMaterial.json", scene.getMeshByName("MarnieDress"));
        this.setupMaterial("Hat", "/characters/hatMaterial.json", scene.getMeshByName("Hat"));
        this.setupMaterial("Hair", "/characters/hairMaterial.json", scene.getMeshByName("Hair"));
        // 頭
        this.setupMaterial("Head", "/characters/headMaterial.json", scene.getMeshByName("Head_primitive0"));
        // 顔
        this.setupMaterial("Face", "/characters/faceMaterial.json", scene.getMeshByName("Head_primitive1"));
        // 眉毛
        this.setupMaterial("Mayu", "/characters/mayuMaterial.json", scene.getMeshByName("Head_primitive2"));
        // 左目
        this.setupMaterial("Eye.l", "/characters/bodyMaterial.json", scene.getMeshByName("Head_primitive3"));
        // 右目
        this.setupMaterial("Eye.r", "/characters/bodyMaterial.json", scene.getMeshByName("Head_primitive4"));
        this.setupMaterial("Body", "/characters/bodyMaterial.json", scene.getMeshByName("Body"));
        //this.setupTexture(scene);
        // ロード中に中途半端な状態で見えてしまう問題に対する暫定的な対策
        setTimeout(() => { this.meshVisibility(scene, true) }, 3000);
      } catch (e) {
        console.error(e);
      }
    });
  }

  meshVisibility(scene, visible = true) {
    scene.meshes.forEach((mesh) => {
      mesh.setEnabled(visible);
    });
  }

  setupBodyMorph(scene) {
    let bodyMesh = scene.getMeshByName("Body");
    let morphTargetManager = bodyMesh.morphTargetManager;
    const freq = 15; // 大きくなればなるほど揺れる頻度が下がる

    scene.registerBeforeRender(() => {
      let target = morphTargetManager.getTarget(0);
      target.influence = 0.9 + Math.sin((window.performance.now() / freq / 180) * Math.PI) / 100;
    });
  }

  setupHeadMorph(scene) {
    ["Head_primitive0", "Head_primitive1", "Head_primitive2", "Head_primitive3", "Head_primitive4"].forEach((mName) => {
      let headMesh = scene.getMeshByName(mName);
      let morphTargetManager = headMesh.morphTargetManager;
      /* 首が微妙にズレて隙間が空く問題を修正 */
      headMesh.position.x = -0.00155;  // 左右(マイナスで左に)
      headMesh.position.y = -0.00085; // 高さ(マイナスで低く)
      headMesh.position.z = -0.0001; // 前後(マイナスで前に)
      scene.registerBeforeRender(() => {
        this.updateMabataki();
        //this.randomMouse();
        for (let i = 0; i < morphTargetManager.numTargets; i++) {
          let target = morphTargetManager.getTarget(i);
          //target.influence = Math.sin((window.performance.now() / 180) * Math.PI);
          target.influence = this.headMorphValue[target.name];
        }
      });
    });
  }

  setupMaterial(matName, matFile, mesh) {
    mesh.renderingGroupId = 1;
    NodeMaterial.ParseFromFileAsync(matName, matFile, this.scene).then((nMat) => {
      nMat.getInputBlockByPredicate((b) => b.name === "diffuseCut").value = 0.21;
      nMat.getInputBlockByPredicate((b) => b.name === "shadowItensity").value = 0.87;
      nMat.getInputBlockByPredicate((b) => b.name === "rimIntensity").value = 0.08;
      //mesh.position.y = ;
      //mesh.scaling.scaleInPlace(0.1);
      //mesh.scaling.x = -1;
      //mesh.scaling.y = -1;
      //mesh.scaling.z = -1;
      // ノードマテリアルのテクスチャのUVを更新するサンプル
      this.scene.registerBeforeRender(function () {
        //nMat.getBlockByName("Texture").texture.uOffset += 0.0001;
      });
      // 画像を更新したい場合
      //let texture = new BABYLON.Texture(texturePath, this.scene);
      //console.log(nMat.getBlockByName("Texture").texture);
      //nMat.getBlockByName("Texture").texture = texture;


      // なぜかメッシュの一部が透明になる問題の対策
      mesh.hasVertexAlpha = false;
      // マテリアル
      mesh.material = nMat;

      // アウトライン
      //mesh.skeleton.enableBlending(0.01);
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.0005;
      mesh.outlineColor = Color3.Black();
      //mesh.overlayColor = BABYLON.Color3.Green();
      //mesh.renderOverlay = true;
      // 影
      var shadowGenerator = new ShadowGenerator(2048, this.light, true);
      shadowGenerator.getShadowMap().renderList.push(mesh)
      shadowGenerator.setDarkness(0.2);
      shadowGenerator.filter = ShadowGenerator.FILTER_PCSS;

      // shadowGenerator.usePoissonSampling = true;
      //shadowGenerator.useContactHardeningShadow = true;
      // shadowGenerator.usePercentageCloserFiltering = true;

      shadowGenerator.contactHardeningLightSizeUVRatio = 0.05;
      shadowGenerator.bias = 0.014
      mesh.receiveShadows = true;
      //mesh.useVertexColors = false;
      //mesh.useVertexAlpha = false;
    });
  }

  setupBone(scene) {
    const bone = scene.getBoneByName("rig").getTransformNode();
    const neck = scene.getBoneByName("c_neck.x").getTransformNode();
    const head = scene.getBoneByName("c_head.x").getTransformNode();
    const freq = 15; // 大きくなればなるほど揺れる頻度が下がる
    /*
    const spine03 = scene.getBoneByName("c_spine_03.x").getTransformNode();
    const spine02 = scene.getBoneByName("c_spine_02.x").getTransformNode();
    const arm = scene.getBoneByName("c_arm_fk.l").getTransformNode();
    const forearm = scene.getBoneByName("c_forearm_fk.l").getTransformNode();
    */
    scene.registerBeforeRender(() => {
      //b_form.scaling.set(10, 10, 10);
      // 左右を向く(-3.14 ～ 3.14)
      const roll = this.average(this.rigRollValues); //Math.sin((window.performance.now() / freq / 180) * Math.PI) / 5;
      const pitch = this.average(this.rigPitchValues);
      // 左右に揺れる(自動)
      const yaw = Math.sin((window.performance.now() / freq / 180) * Math.PI) / 500;
      const rpyQuaternion = Quaternion.RotationYawPitchRoll(roll / 2, 0, yaw / 4);
      bone.rotationQuaternion.set(rpyQuaternion.x, rpyQuaternion.y, rpyQuaternion.z, rpyQuaternion.w);
      //const neckQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(Math.sin((window.performance.now() / freq / 180) * Math.PI), 0, 0);
      const neckQuaternion = Quaternion.RotationYawPitchRoll(roll / 2, pitch / 2, yaw * 2);
      neck.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
      head.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
      //spine03.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
      //spine02.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
      //arm.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
      //forearm.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);

      //b_form.rotation.x = Math.sin((window.performance.now() / 180) * Math.PI)*180;
      //bone.setAxisAngle(BABYLON.Axis.Z, Math.sin((window.performance.now() / 180) * Math.PI)*180, BABYLON.Space.WORLD, headMesh);
      //b_form.rotate(BABYLON.Axis.Z, Math.sin((window.performance.now() / 180) * Math.PI)/500, BABYLON.Space.WORLD);
    });
  }

  setupTexture(scene) {
    const bMat = scene.getMaterialByName("Dress");

    scene.registerBeforeRender(function () {
      //bMat.getActiveTextures()[0].uOffset += 0.0001;
    });
  }
}
