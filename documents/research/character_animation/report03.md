# 質問回答レポート：単眼WebカメラによるVRM上半身モーション品質改善

本回答は、**MediaPipe Pose / Hand / Face Landmarker + VRM-1.0 + Three.js** を前提に、設計・実装担当者がパラメータ設計や実装順序を決めるための回答として整理します。MediaPipe Pose は2D画像座標と3D world landmarks、Hand Landmarker は手のlandmarks・world landmarks・handedness、Face Landmarker は3D face landmarks・blendshape・facial transformation matrixを出力できますが、ここでは表情・視線は扱わず、身体・頭部・腕・手首・指の制御に限定します。([Google AI for Developers][1])

---

## 1. 最初に品質差が出る領域と実装順

結論として、**最初に品質差が出るのは「信頼度評価」と「時系列処理」**です。IKは重要ですが、入力が不安定なまま高品質なIKを実装しても、肘反転、手首暴れ、肩崩れを増幅することがあります。

推奨順は次です。

| 順位 | 領域                                    | 理由                                                     |
| ---: | --------------------------------------- | -------------------------------------------------------- |
|    0 | 記録・再生・デバッグ表示                | 調整結果を再現できなければ品質改善が不可能               |
|    1 | 最小キャリブレーション                  | 肩幅・腕長・正面基準がないと、IK以前にスケールが破綻する |
|    2 | 信頼度評価                              | 悪い観測値をそのまま使わないための土台                   |
|    3 | 時系列処理                              | jitter、dropout、再検出ジャンプを直接抑える              |
|    4 | 基本IK / retarget                       | 安定したtargetをVRMボーンへ変換する                      |
|    5 | 詳細キャリブレーション / avatar profile | モデル差、VRoid体型差を吸収する                          |
|    6 | セマンティック動作化                    | 「かわいい」「意図が伝わる」動作へ昇華する               |

実装上は、**IKを後回しにする**というより、最初のIKは簡素でよいので、同時に `reliability → temporal state → canonical state` の流れを先に作るのが重要です。

MediaPipeのWeb向けLandmarkerは `detectForVideo()` 系が同期実行でUI threadをブロックするため、必要に応じてWeb Workerに分離できます。これは単なる性能最適化ではなく、検出タイミングの揺れを抑える意味でも有効です。([Google AI for Developers][1])

---

## 2. かわいい/自然に見せる上で最も避けるべき破綻

専門家視点では、避けるべき順序は次です。

| 優先度 | 破綻                            | 理由                                                       |
| -----: | ------------------------------- | ---------------------------------------------------------- |
|      1 | **胴体・頭部のjitter**          | キャラクター全体が不安定に見え、生命感ではなく故障感になる |
|      2 | **肘反転**                      | 腕の構造が一瞬で裏返り、視覚的に非常に目立つ               |
|      3 | **肩崩れ / 肩が胴体にめり込む** | VRoid系では肩・胸・袖まわりの破綻が見た目に直結する        |
|      4 | **手首roll暴れ**                | 手先の回転は小さくても目立ち、操り人形感が出る             |
|      5 | **腕の伸び切り**                | かわいさより「硬い」「無理している」印象になる             |
|      6 | 指のちらつき                    | 目立つが、腕・肩・頭ほど致命的ではない                     |

最も重要なのは、**大きい部位ほど安定、小さい部位ほど表現的に動かす**という設計です。胴体・頭・肩は控えめに、手・指・短いジェスチャーはやや表現的に、という分担が自然です。

---

## 3. 初期キャリブレーションで取ってもらう姿勢

推奨は、**Tポーズではなく「正面自然姿勢 + 軽いAポーズ」**です。TポーズはWebカメラでは手が画面外に出やすく、肩も不自然に上がるため、上半身用途では実用性が低いです。

現実的な手順は次です。

| 手順 |       時間 | 姿勢                                                 | 取得する値                                  |
| ---: | ---------: | ---------------------------------------------------- | ------------------------------------------- |
|    1 | 1.5〜2.0秒 | 正面を向き、肩の力を抜く。両肩・顔・肘・手首が画面内 | neutral torso、shoulder width、head neutral |
|    2 | 1.5〜2.0秒 | 腕を体から20〜30°ほど開く。肘は軽く曲げる            | upper/lower arm length、elbow plane初期値   |
|    3 |      1.0秒 | 両手を胸〜腰の高さで軽く開く                         | hand scale、finger neutral                  |
|    4 | 任意 1.0秒 | 顔を少し左右に向ける                                 | head yaw fallback確認                       |

合計で **4〜6秒程度**が現実的です。UI上は「両肩と両手が画面に入る位置で、正面を向いてください」から始め、次に「肘を軽く曲げ、腕を少し開いてください」と案内するのがよいです。

---

## 4. 初期キャリブレーション失敗時の症状とオンライン補正

初期キャリブレーションに失敗すると、見た目には次の症状が出ます。

| 失敗項目                    | 見た目の症状                              |
| --------------------------- | ----------------------------------------- |
| shoulder width過小          | 腕が胴体に寄りすぎる、胸の前で潰れる      |
| shoulder width過大          | 腕が常に外へ開く                          |
| upper arm / lower arm長過小 | 腕がすぐ伸び切る、手先が届かない          |
| upper arm / lower arm長過大 | 腕が曲がりすぎる、手が不自然に届きすぎる  |
| neutral torso yaw失敗       | キャラが常に斜めを向く                    |
| head neutral失敗            | 首が常に傾く                              |
| hand scale失敗              | 指curl判定が過敏または鈍くなる            |
| camera distance推定失敗     | 奥行き方向の動きが大きすぎる / 小さすぎる |

オンラインキャリブレーションで安全に補正できる項目と、避けるべき項目は分けます。

| 分類         | 項目                               | 方針                                                 |
| ------------ | ---------------------------------- | ---------------------------------------------------- |
| 安全に補正可 | shoulder widthの低速更新           | 高信頼度・正面・near-neutral時のみ、数十秒単位で更新 |
| 安全に補正可 | torso center / neutral yawの微修正 | 急に変えず、非常に低い係数で更新                     |
| 安全に補正可 | camera framing / body scale        | カメラ距離変化への追従として有効                     |
| 安全に補正可 | hand open/close基準                | 高信頼度の開き手・閉じ手を蓄積して補正               |
| 原則固定     | アバターのbone length              | モデル固有値なので変えない                           |
| 原則固定     | VRM rest rotation offset           | 動的変更するとモデル全体が崩れる                     |
| 原則固定     | handedness mapping                 | オンラインで揺らすと左右入れ替え事故が起きる         |
| 原則固定     | 関節可動域                         | ユーザー姿勢に合わせて変えると破綻を許容してしまう   |
| 原則固定     | palm basisの軸定義                 | 実装規約なので動的補正しない                         |

オンライン補正は、**「人間側の観測基準」はゆっくり補正し、「アバター側の構造」は固定**が基本です。VRM-1.0ではモデルごとのrest rotationやoptional bone差分を考慮する必要があり、NormalizedLocalRotationのような中間形式で吸収する設計が示されています。([GitHub][2])

---

## 5. MediaPipe world landmarksで信用できる成分

単眼Webカメラでは、world landmarksを絶対3D位置として扱うべきではありません。ただし、全てが無価値ではありません。

| 成分                      | 信用度 | 使い方                                 |
| ------------------------- | -----: | -------------------------------------- |
| 画像上の左右 `x`          |     高 | 肩幅、手の左右位置、openness           |
| 画像上の上下 `y`          |     高 | 手上げ、頭/肩/腰の相対高さ             |
| worldの左右相対方向       | 中〜高 | shoulder→elbow、shoulder line          |
| worldの上下相対方向       |     中 | arm elevation、torso up                |
| worldの奥行き `z`         | 低〜中 | forwardnessの補助。単独判定は禁止      |
| connected jointの相対角度 |     中 | elbowFlexionHint、腕の向き             |
| bone lengthの絶対値       |     低 | モーションには使わず、信頼度評価に使う |
| body yaw                  |     中 | shoulder line単独ではなくFaceと混ぜる  |
| wrist absolute position   |     低 | avatar手先targetに直結しない           |

実装方針は、**左右・上下・相対方向は使う、奥行きは圧縮して使う、絶対距離は信頼度評価に回す**です。

---

## 6. canonical arm stateの安定推定

`elevation / forwardness / openness / elbowFlexionHint` は、landmark座標そのものではなく、体幹ローカル空間で計算します。

まず体幹基準を作ります。

```text
U = normalize(shoulderCenter - hipCenter)        // 上
R = normalize(rightShoulder - leftShoulder)      // 右
F = normalize(cross(R, U))                       // 前
```

腕ごとの特徴量は次のように計算します。

| 状態量           | 推定方法                                           | 注意点                                            |
| ---------------- | -------------------------------------------------- | ------------------------------------------------- |
| elevation        | `dot(shoulder→wrist, U)` または `dot(upperArm, U)` | wristだけだと手先ノイズに弱いためupperArmも混ぜる |
| openness         | `dot(shoulder→wrist, ±R)`                          | 左右の符号を正規化し、体から横に開く度合いにする  |
| forwardness      | `dot(shoulder→wrist, F)`                           | world zだけでなく2D短縮・手サイズも使う           |
| elbowFlexionHint | `angle(shoulder-elbow-wrist)`                      | 腕が伸び切ると不安定なので信頼度を下げる          |

「前に出す」と「横に広げる」の判定は、単一値ではなくスコアで行います。

```text
sideScore =
  normalized lateral wrist offset
+ normalized lateral elbow offset

forwardScore =
  compressed world-z wrist offset
+ projected arm shortening
+ hand-size increase
- lateral openness penalty
```

目安は次です。

| 判定       | 条件例                                      |
| ---------- | ------------------------------------------- |
| 横に広げる | `openness > 0.55` かつ `forwardness < 0.35` |
| 前に出す   | `forwardness > 0.45` かつ `openness < 0.55` |
| 斜め前     | `forwardness > 0.35` かつ `openness > 0.35` |
| 不明       | hand/pose confidence低、または腕が画面端    |

奥行きは弱いため、`forwardness` は必ずヒステリシスを入れます。例えば、前方向に入る閾値を0.50、抜ける閾値を0.35にします。

---

## 7. 肘pole vectorのブレンド比率と状態遷移

肘pole vectorは、実測値・前フレーム・体幹fallbackを状態に応じて混ぜます。

| 状態       | 条件                                |     実測肘 | 前フレーム |   fallback |
| ---------- | ----------------------------------- | ---------: | ---------: | ---------: |
| Stable     | arm confidence > 0.75、肘角度が安定 | 0.65〜0.80 | 0.15〜0.30 | 0.05〜0.10 |
| Uncertain  | 0.45〜0.75、奥行き不安定            | 0.25〜0.45 | 0.40〜0.60 | 0.10〜0.20 |
| Extended   | 腕が伸び切り気味                    | 0.10〜0.25 | 0.50〜0.70 | 0.20〜0.30 |
| Lost       | confidence < 0.45が数フレーム継続   |       0.00 | 0.60〜0.80 | 0.20〜0.40 |
| Recovering | 再検出後200〜400ms                  |  0.20→0.70 |  0.60→0.20 |  0.20→0.10 |

破綻防止の条件は次です。

```text
if dot(measuredPole, previousPole) < 0:
    measuredPole を拒否、または重みを大幅に下げる

if angularChange(measuredPole, previousPole) > 60°/frame:
    measuredPoleWeight *= 0.2

if elbowFlexion < 15°:
    poleは実測ではなく previous + fallback 優先
```

fallbackは、左右の肘が体の外側へ出るように設計します。

```text
leftFallbackPole  = normalize(-R * 0.8 + -U * 0.2 + F * 0.1)
rightFallbackPole = normalize( R * 0.8 + -U * 0.2 + F * 0.1)
```

---

## 8. VRoid系の小柄・大きな頭キャラ向け圧縮比率

VRoid系キャラクターでは、現実の人間より頭が大きく、肩幅が狭く、腕が短く見えることがあります。したがって、実写の手先位置をそのまま使わず、**reach・肩幅・奥行きを圧縮**します。

初期値としては次が使いやすいです。

| 項目                   | 初期値 | 推奨レンジ |
| ---------------------- | -----: | ---------: |
| arm reach scale        |   0.92 | 0.88〜0.96 |
| lateral shoulder scale |   0.90 | 0.80〜0.98 |
| vertical arm scale     |   0.95 | 0.90〜1.00 |
| depth compression      |   0.60 | 0.45〜0.75 |
| elbow outward bias     |   0.25 | 0.15〜0.35 |
| wrist roll influence   |   0.40 | 0.25〜0.60 |
| chest follow           |   0.55 | 0.40〜0.70 |

特に重要なのは `depth compression` です。単眼カメラの奥行きをそのまま使うと、手を前に出したときに腕が伸び切ったり、顔や胸にめり込みやすくなります。

実装では、次のように部位別にスケールします。

```text
avatarTarget.x = humanLocal.x * lateralScale
avatarTarget.y = humanLocal.y * verticalScale
avatarTarget.z = humanLocal.z * depthCompression
avatarTarget   = clampToReach(avatarTarget, armReachScale)
```

---

## 9. 肩・鎖骨・胸の補正目安

肩・鎖骨・胸の補正は、上半身品質にかなり効きます。腕を上げてもupperArmだけを回すと、肩が胴体に刺さったように見えます。

腕のelevation別の目安は次です。

| 腕の高さ | shoulder bone | upperChest |  chest |
| -------- | ------------: | ---------: | -----: |
| 0〜30°   |         0〜3° |         0° |     0° |
| 30〜70°  |         3〜8° |      2〜6° |  0〜3° |
| 70〜110° |        8〜15° |     6〜12° |  3〜8° |
| 110°以上 |       12〜20° |    10〜18° | 5〜12° |

分配の考え方は次です。

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)

shoulderLift = armRaiseAssist * 15°
upperChest   = armRaiseAssist * 10°
chest        = armRaiseAssist * 5°
```

片腕だけ上げる場合は、胸全体を大きく傾けすぎないようにします。両腕を上げる場合は、upperChestとchestを少し後ろへ倒すと自然です。

| ケース         | 補正                                           |
| -------------- | ---------------------------------------------- |
| 片腕上げ       | その側のshoulderを主に使い、upperChestは控えめ |
| 両腕上げ       | upperChest/chestを少し使う                     |
| 肩ボーンなし   | upperChestとupperArm側へ分配                   |
| upperChestなし | chestへ60〜70%、spineへ30〜40%吸収             |

VRM-1.0では `upperChest` や `leftShoulder` などはモデルによって存在しない場合があり、optional bone差分を考慮する必要があります。([GitHub][2])

---

## 10. 頭部姿勢：Face matrixとPose由来fallback

頭部姿勢は、Face Landmarkerのfacial transformation matrixを主入力にするのがよいです。Face Landmarkerは顔landmarksに加えて、エフェクト描画などに使えるtransformation matrixを出力できます。([Google AI for Developers][3])

推奨ブレンドは次です。

| 状態          | Face matrix | Pose nose/eyes/ears | previous/chest |
| ------------- | ----------: | ------------------: | -------------: |
| Face stable   |  0.80〜0.95 |          0.05〜0.15 |     0.00〜0.05 |
| Face medium   |  0.45〜0.65 |          0.20〜0.35 |     0.10〜0.20 |
| Face unstable |  0.10〜0.30 |          0.30〜0.50 |     0.30〜0.50 |
| Face lost     |        0.00 |          0.00〜0.30 |     0.70〜1.00 |

Face matrixを信用する条件は次です。

```text
facePresence > 0.70
trackingConfidence > 0.70
face bbox が画面端に近すぎない
前フレームからの角度変化が大きすぎない
顔landmarkの左右対称性が極端に崩れていない
```

Pose fallbackでは、鼻・目・耳から頭の向きを推定できますが、耳が片側しか見えない横向きでは不安定になります。そのため、Pose由来は主に **yawの補助** として使い、pitch/rollは弱く扱います。

欠落時は、頭を即neutralに戻さず、**upperChestの向きへ0.5〜1.0秒程度で戻す**のが自然です。

---

## 11. palm basisによる手首姿勢で信用する軸・捨てる軸

Hand Landmarkerは21点の手landmarksとworld landmarksを返します。手のlandmarkの `z` はwristを原点とする奥行きで、値が小さいほどカメラに近いと説明されています。([Google AI for Developers][4])

手首姿勢では、次の基底を作ります。

```text
palmRight  = normalize(indexMcp - pinkyMcp)
palmUp     = normalize(middleMcp - wrist)
palmNormal = normalize(cross(palmRight, palmUp))
```

ただし、状況に応じて信用する軸を変えます。

| 手の見え方     | 信用する軸                    | 捨てる/弱める軸        |
| -------------- | ----------------------------- | ---------------------- |
| 手のひらが正面 | palmRight, palmUp, palmNormal | ほぼ全て使用可         |
| 手の甲が正面   | palmRight, palmUp             | normalの符号反転に注意 |
| 手が横向き     | palmUp / finger direction     | palmNormal, wrist roll |
| 顔や物で隠れる | previous wrist orientation    | palm basis全体         |
| 指が重なる     | wrist→middle方向              | splay, roll            |
| 手が小さい     | 低周波成分のみ                | roll, fine rotation    |

手首rollは最も暴れやすいため、次の扱いにします。

```text
wrist pitch/yaw: 中程度に反映
wrist roll: 強く平滑化、またはforearm twistへ分配
```

目安は、roll成分の反映を **25〜60%** に抑え、残りは前腕twistまたはneutralへ逃がします。

---

## 12. VRMキャラで破綻しにくい指制御の粒度

指は、各関節の3D回転を完全再現しようとしない方が安定します。推奨優先順位は次です。

| 優先度 | 粒度                     | 内容                                 |
| -----: | ------------------------ | ------------------------------------ |
|      1 | 全指まとめたopen/close   | 最も安定。初期実装向き               |
|      2 | 親指だけ別 + 他4指まとめ | サムズアップ、握り手の自然さが上がる |
|      3 | 親指・人差し指・他3指    | 指差し、ピースの準備になる           |
|      4 | 各指curlのみ             | 実用上の高品質ライン                 |
|      5 | 各指curl + 限定splay     | 表現力は上がるがちらつきやすい       |
|      6 | 各関節3D回転             | 単眼Webカメラでは非推奨              |

最初の品質ラインとしては、**親指・人差し指・中指・薬指小指グループ**の4系統で十分です。

```ts
type PracticalFingerPose = {
    thumb: { curl: number; oppose: number };
    index: { curl: number; spread?: number };
    middle: { curl: number };
    ringLittle: { curl: number };
};
```

VRM指ボーンへの割り当ては、curlを各関節へ分配します。

| 指ボーン     | curl配分 |
| ------------ | -------: |
| proximal     |  50〜60% |
| intermediate |  30〜40% |
| distal       |  10〜20% |

splayは入れるとしても、index/littleに限定し、±10〜15°程度から始めるのが安全です。

---

## 13. 手が一時的に消えた場合の部位別挙動

手が消えたときに全てを即neutralへ戻すと不自然です。部位ごとに挙動を変えます。

| 部位             | 0〜200ms                                       | 200〜700ms                     | 700ms以降      |
| ---------------- | ---------------------------------------------- | ------------------------------ | -------------- |
| 腕               | Pose wristがあれば継続。なければ速度減衰で予測 | comfortable poseへゆっくり戻す | rest寄りに安定 |
| 肘pole           | 前フレーム保持 + fallback混合                  | fallback比率を上げる           | fallback中心   |
| 手首             | 直前姿勢保持                                   | forearm-aligned neutralへ戻す  | neutral維持    |
| 指               | 直前姿勢保持                                   | 半開きneutralへ戻す            | relaxed hand   |
| semantic gesture | 200〜300msだけ保持                             | fade out                       | inactive       |

推奨状態遷移は次です。

```text
Tracked
  ↓ confidence低下 2〜3 frames
Suspect
  ↓ 200ms復帰なし
Predicted
  ↓ 700ms復帰なし
Lost
  ↓ 再検出
Recovering
  ↓ 200〜500ms blend
Tracked
```

Hand Landmarker自体もVideo/Live stream modeではhand presenceやtracking confidenceに応じて検出器とtrackingを切り替える設計になっているため、アプリ側でも同様に状態を持つべきです。([Google AI for Developers][5])

---

## 14. フィルタの使い分けと推奨パラメータ

フィルタは1種類で全身にかけるのではなく、目的別に使い分けます。One Euro Filterは、低速時にjitterを抑え、高速時に遅延を減らすための速度適応型low-pass filterで、公式ページでも `mincutoff` と `beta` を段階的に調整する手順が示されています。([Géry Casiez][6])

| フィルタ             | 使いどころ                                       |
| -------------------- | ------------------------------------------------ |
| EMA                  | 低周波の品質スコア、キャリブレーション値、UI表示 |
| One Euro Filter      | wrist target、head、canonical scalar             |
| Kalman filter        | 手・関節の一時欠落、予測、再検出復帰             |
| quaternion smoothing | 最終ボーン回転、head/chest/wrist rotation        |

初期値の目安です。One Euro Filterの `beta` は実装単位に依存するため、以下は**体長正規化座標・角度正規化値**を前提にした出発点です。

| 部位               | minCutoff |       beta | 備考                       |
| ------------------ | --------: | ---------: | -------------------------- |
| torso rotation     |  0.5〜0.8 | 0.05〜0.15 | 安定重視                   |
| chest / upperChest |  0.7〜1.2 | 0.05〜0.20 | 胴体jitter抑制             |
| head rotation      |  1.0〜1.8 | 0.10〜0.30 | 会話用途では遅れすぎに注意 |
| wrist target       |  1.5〜2.5 | 0.20〜0.60 | 手の反応性重視             |
| elbow pole         |  0.8〜1.5 | 0.05〜0.20 | flip防止を優先             |
| wrist roll         |  0.5〜1.2 | 0.03〜0.15 | 強く抑える                 |
| finger curl        |  3.0〜6.0 | 0.20〜1.00 | hysteresis併用             |

遅延許容量の実用目安は次です。

| 部位 | 追加遅延の目標 |
| ---- | -------------: |
| 指   |       30〜60ms |
| 手先 |       50〜90ms |
| 頭   |      50〜100ms |
| 胴体 |      80〜150ms |
| 肩   |      80〜150ms |

会話アプリでは、**手・頭の体感遅延は100ms前後以内**を目標にしたいです。WebパフォーマンスのRAILモデルでも、ユーザー入力に対する可視応答は100ms以内を目標とする考え方が示されています。アバターモーションは通常のUI入力とは異なりますが、体感の基準値として有用です。([web.dev][7])

---

## 15. Pose起点Hand/Face ROI化の効果と判断基準

Pose起点でHand/FaceのROIを切る方式は、特に**手が小さく写る場合、速く動く場合、左右取り違えが起きる場合**に効果が大きいです。

MediaPipe Holisticの設計では、まずposeを推定し、そのkeypointから左右の手と顔のROIを導出し、full-resolution cropを各専用モデルに入力します。この構成により、速い動きへの反応、左右のsemantic consistency、手・顔の解像度問題を改善する意図が説明されています。([Google Research][8])

判断基準は次です。

| 条件           | 全画面Handで十分      | ROI化推奨                |
| -------------- | --------------------- | ------------------------ |
| カメラ距離     | 近い                  | 遠い                     |
| 手の画面サイズ | 手bboxが80〜120px以上 | 80px未満が多い           |
| 動き           | ゆっくり              | 速い手振りが多い         |
| 人数           | 1人固定               | 複数人/背景に人          |
| 左右入れ替え   | ほぼ起きない          | 腕交差や顔前の手で起きる |
| 顔と手の重なり | 少ない                | 多い                     |
| 品質要求       | 大まかな動きでよい    | 指・手首まで使う         |

ROI化で期待すべき主な改善は、平均誤差よりも **dropout率、左右取り違え、再検出時のジャンプ** の低減です。

---

## 16. カメラ品質スコアをUXへ反映する方法

UXでは、内部用語を出さず、ユーザーが直せる行動だけを提示します。警告は同時に1〜2個までに抑えるのがよいです。

| 検出した問題     | 表示するガイド                                                           |
| ---------------- | ------------------------------------------------------------------------ |
| 肩が入っていない | 「もう少し離れて、両肩が入るようにしてください」                         |
| 手が画面端       | 「手が画面の端に近いです。少し中央で動かしてください」                   |
| 手が小さい       | 「手が小さく写っています。少しカメラに近づくか、解像度を上げてください」 |
| 顔だけ大きい     | 「上半身が入るように、カメラから少し離れてください」                     |
| 露出不足         | 「部屋を少し明るくしてください」                                         |
| motion blur      | 「手の動きが速すぎるか、映像が暗い可能性があります」                     |
| body not frontal | 「正面を向くと動きが安定します」                                         |
| confidence低下   | 「手や肘が隠れないようにしてください」                                   |

技術的には、`requestVideoFrameCallback()` を使うと動画フレームごとのmetadata、`presentedFrames`、`mediaTime` などが取得でき、フレーム欠落やタイムスタンプ管理に使えます。([MDNウェブドキュメント][9])

---

## 17. semantic motion layerの発火条件とブレンド比率

短い上半身clipは、常時上書きではなく **additive blend** として使います。MediaPipe Gesture Recognizerはリアルタイムgesture recognitionの結果、hand landmarks、handednessなどを返せるため、semantic layerの補助入力として使えます。([Google AI for Developers][4])

発火条件の基本は次です。

```text
gesture confidence > 0.70
かつ hand reliability > 0.60
かつ 条件継続 150〜250ms
かつ cooldown 300〜800ms
```

ブレンド比率の目安です。

| 状況                        |   tracking | semantic clip |
| --------------------------- | ---------: | ------------: |
| 通常                        | 0.85〜0.95 |    0.05〜0.15 |
| 軽い意図検出                | 0.70〜0.85 |    0.15〜0.30 |
| 指差し / ピース安定         | 0.60〜0.75 |    0.25〜0.40 |
| 手振り動作                  | 0.40〜0.70 |    0.30〜0.60 |
| tracking低下中のgesture継続 | 0.30〜0.50 |    0.50〜0.70 |

不自然にしないためのルールは次です。

| ルール                      | 理由                                 |
| --------------------------- | ------------------------------------ |
| fade-in 150〜250ms          | 急にclipへ切り替わるのを防ぐ         |
| fade-out 250〜500ms         | gesture終了時の戻りを自然にする      |
| 肩・上腕はtracking寄り      | clipで肩まで大きく上書きすると不自然 |
| 手首・指はclip寄りでも可    | semantic gestureの印象が出やすい     |
| gesture labelにヒステリシス | Open/Close/Pointingのちらつきを防ぐ  |
| 手振りは周期検出を使う      | OpenPalmだけでは誤発火しやすい       |

例えば手振りは、`Open_Palm` だけでなく、手が肩〜顔の高さにあり、左右速度の符号反転が0.5〜1.2秒内に2回以上ある、という条件を加えると誤発火が減ります。

---

## 18. 最低限用意すべき固定テストモーション

最低限のテストセットは次です。

| No. | テスト                        | 見るべき項目                    |
| --: | ----------------------------- | ------------------------------- |
|   1 | neutral 10秒                  | torso/head/wrist jitter         |
|   2 | 片手をゆっくり上げる 左右     | shoulder補正、肘pole            |
|   3 | 両手をゆっくり上げる          | chest/upperChest分配            |
|   4 | 手を横に広げる                | openness判定、腕長補正          |
|   5 | 手を前に出す                  | forwardness、depth compression  |
|   6 | 速い手振り                    | latency、semantic wave、dropout |
|   7 | 手を顔の前に置く              | occlusion、手首/指の安定        |
|   8 | 腕を交差する                  | 左右取り違え、pole反転          |
|   9 | 片手を画面外へ出して戻す      | Lost/Recovering状態             |
|  10 | 指差し・開き手・握り手        | finger curl / gesture state     |
|  11 | 顔を左右に向ける              | Face/Pose fallback              |
|  12 | 小柄VRoidモデルで同一ログ再生 | proportion mapping              |

ライブカメラで毎回試すのではなく、MediaPipe出力を記録し、同じ入力ログで再生するのが重要です。

---

## 19. 最初に見るべき定量指標と許容ライン

最初に見るべき指標は、次の5つです。

| 優先度 | 指標                  | 許容ラインの目安                              |
| -----: | --------------------- | --------------------------------------------- |
|      1 | neutral jitter        | torso/head RMS 0.5〜1.0°以下、wrist 2〜3°以下 |
|      2 | elbow flip count      | 固定テスト中0回                               |
|      3 | dropout recovery jump | 復帰時の角度ジャンプ10〜15°以下               |
|      4 | added latency         | 手・頭は50〜100ms、胴体は150ms以内            |
|      5 | bone length variance  | 高信頼度時の上腕/前腕推定長CV 5〜8%以内       |

追加で見るとよい指標です。

| 指標                         | 用途                             |
| ---------------------------- | -------------------------------- |
| angular velocity spike count | ボーン回転の瞬間的な飛び検出     |
| border risk duration         | カメラ構図問題の検出             |
| left-right swap count        | handedness補正の評価             |
| reach clamp occupancy        | 腕が伸び切っている時間の割合     |
| semantic label flicker       | gesture stateのちらつき          |
| recovery time                | 手が戻ってから安定するまでの時間 |

`reach clamp occupancy` は、固定テスト中に10〜20%を超えるなら、キャリブレーション、腕長、depth compression、target scaleのいずれかが悪い可能性が高いです。

---

## 20. 「よく動くが不安定」か「控えめだが破綻しない」か

キャラクター会話アプリでは、基本方針として **「控えめだが破綻しない」** を優先すべきです。

理由は次です。

| 観点       | 判断                                                 |
| ---------- | ---------------------------------------------------- |
| 会話体験   | 破綻した大きな動きは発話内容への集中を妨げる         |
| かわいさ   | 控えめで滑らかな動きの方がキャラクター性を保ちやすい |
| 信頼感     | 肘反転や手首暴れは「壊れている」印象になる           |
| 長時間利用 | 大きく不安定な動きは見疲れしやすい                   |
| 実装安全性 | confidenceに応じて動きを減らす方が破綻しにくい       |

ただし、単に動かないキャラクターにするのではなく、次の落とし所がよいです。

```text
胴体・肩・頭:
  安定優先、低振幅、低周波

腕:
  中程度に追従。ただしreach clampとelbow biasを強くする

手首:
  rollを抑え、pitch/yaw中心

指:
  semantic gesture時だけ表現を強める

高confidence時:
  少し大きく動かす

低confidence時:
  すぐ止めず、なめらかに控えめなposeへ退避
```

最終的な設計原則は、**動きの大きさを信頼度に比例させる**ことです。

```text
motionAmplitude = baseAmplitude * confidenceAdjustedExpressiveness
```

これにより、高品質に検出できているときは自然に動き、検出が不安定なときは「壊れる」のではなく「控えめに落ち着く」挙動になります。キャラクター会話アプリでは、この方が利用者にとって自然です。

[1]: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google AI for Developers"
[2]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md "vrm-specification/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md at master · vrm-c/vrm-specification · GitHub"
[3]: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google AI for Developers"
[4]: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google AI for Developers"
[5]: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google AI for Developers"
[6]: https://gery.casiez.net/1euro/ "1€ Filter"
[7]: https://web.dev/articles/rail?utm_source=chatgpt.com "Measure performance with the RAIL model | Articles"
[8]: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/ "MediaPipe Holistic — Simultaneous Face, Hand and Pose Prediction, on Device"
[9]: https://developer.mozilla.org/ja/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() メソッド - Web API | MDN"
