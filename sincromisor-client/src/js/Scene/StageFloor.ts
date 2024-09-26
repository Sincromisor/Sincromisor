import { Scene } from '@babylonjs/core/scene';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths';
import { Mesh, MeshBuilder } from '@babylonjs/core/Meshes';
import { ShaderMaterial, StandardMaterial, Effect } from '@babylonjs/core/Materials';
import { Tools } from '@babylonjs/core/Misc';

export class StageFloor {
    scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
        const floor: Mesh = MeshBuilder.CreatePlane('floor', { size: 200 }, this.scene);
        //floor.material = floorMaterial;
        floor.material = this.createFloorShaderMaterial();
        floor.rotation = new Vector3(Tools.ToRadians(90), 0, 0);
        floor.position = new Vector3(0, -50, 0);
    }

    createFloorMaterial(): StandardMaterial {
        const floorMaterial: StandardMaterial = new StandardMaterial('floorMaterial', this.scene);
        /*
          オブジェクトの基本的な色。光がオブジェクトの表面に当たって散乱する際の色。
          赤いリンゴは赤いdiffuse colorを持つ。
          光源からの光がオブジェクトに当たると、その色が視覚的に現れる。
         */
        floorMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1);
        /*
          環境光に対するオブジェクトの色。
          シーン全体に均等に広がる光で、特定の光源からではなく、周囲の環境からの光を表現する。
          暗い部屋でも少しの光がある場合、その光がオブジェクトに当たって見える色がambient color。
        */
        floorMaterial.ambientColor = new Color3(0.1, 0.1, 0.1);
        /* 
          オブジェクト自体が発光する色。オブジェクトが自ら光を放つ場合に使用される。
          ネオンライトやLEDのように、光源として機能するオブジェクトの色。
          emissive colorを設定すると、オブジェクトが周囲の光に関係なく輝いて見える。
        */
        floorMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);
        /*
           オブジェクトの表面で反射する光の色。
           光源からの光がオブジェクトの表面で反射して、ハイライトとして見える部分。
           金属や光沢のある表面で重要。
        */
        floorMaterial.specularColor = new Color3(0, 0, 0);
        floorMaterial.alpha = 0.9;
        floorMaterial.freeze();
        return floorMaterial;
    }

    private createFloorShaderMaterial(): ShaderMaterial {
        const shaderMaterial = new ShaderMaterial('shader', this.scene, {
            vertex: 'floor',
            fragment: 'floor',
        }, {
            needAlphaBlending: true,
            attributes: ['position', 'uv'],
            uniforms: ['worldViewProjection', 'centerColor', 'edgeColor']
        });

        shaderMaterial.setColor4('centerColor', new Color4(0, 0, 0, 1.0)); // 中心の色（黒）
        shaderMaterial.setColor4('edgeColor', new Color4(0.3, 0.3, 0.3, 0.8)); // エッジの色（透明）
        /*
            precision highp float: シェーダーで使用する浮動小数点数の精度を指定します。highpは高精度を意味します。
            attribute: 頂点シェーダーで使用される入力変数です。positionは頂点の位置、uvはテクスチャ座標を表します。
            uniform: シェーダー全体で共有される変数です。worldViewProjectionは変換行列、centerColorとedgeColorは色の情報を保持します。
            varying: 頂点シェーダーからフラグメントシェーダーにデータを渡すための変数です。vUVはテクスチャ座標を保持します。
            gl_Position: 頂点の位置をクリップ空間に設定します。
            length: ベクトルの長さを計算します。ここでは、テクスチャ座標の中心からの距離を計算しています。
            mix: 2つの値を線形補間します。ここでは、中心の色とエッジの色を距離に応じて混合しています。
            gl_FragColor: フラグメントの最終的な色を設定します。
        */
        Effect.ShadersStore['floorVertexShader'] = `
            precision highp float; // 高精度の浮動小数点数を使用することを指定

            attribute vec3 position; // 頂点の位置情報
            attribute vec2 uv; // テクスチャ座標

            uniform mat4 worldViewProjection; // ワールド、ビュー、プロジェクション行列の合成

            varying vec2 vUV; // フラグメントシェーダーに渡すためのテクスチャ座標

            void main(void) {
                gl_Position = worldViewProjection * vec4(position, 1.0); // 頂点の位置を変換してクリップ空間に設定
                vUV = uv; // テクスチャ座標をフラグメントシェーダーに渡す
            }
        `;

        Effect.ShadersStore['floorFragmentShader'] = `
            precision highp float; // 高精度の浮動小数点数を使用することを指定

            varying vec2 vUV; // 頂点シェーダーから渡されたテクスチャ座標

            uniform vec4 centerColor; // 中心の色
            uniform vec4 edgeColor; // エッジの色

            void main(void) {
                float dist = length(vUV - vec2(0.5, 0.5)); // テクスチャ座標の中心からの距離を計算
                vec4 color = mix(centerColor, edgeColor, dist * 2.0); // 中心の色とエッジの色を距離に応じて混合
                gl_FragColor = color; // 計算された色をフラグメントの色として設定
            }
        `;
        shaderMaterial.freeze();
        return shaderMaterial;
    }
}
