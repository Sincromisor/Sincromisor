export const settingHelp = {
    titleText:
        "会話UIなどに表示されるタイトル文字列です。配信名・キャラクター名を表示したい時に設定します。",
    talkMode:
        "応答の進み方を切り替えます。ふだんの会話なら chat、発話の往復を揃えたい時は sincro を選びます。",
    audioInputDeviceId:
        "使うマイクを選びます。未選択ならブラウザで既定になっているマイクを使います。",
    videoInputDeviceId:
        "顔の向きや視線の検出に使うカメラを選びます。未選択ならブラウザで既定になっているカメラを使います。",
    enableNoiseSuppression:
        "周囲のザーッというノイズを抑えます。部屋の空調音やPCファン音が入りやすい時に向いています。",
    enableEchoCancellation:
        "スピーカーから出た音がマイクに戻るのを抑えます。ヘッドホンを使わずに話す時に向いています。",
    enableAutoGainControl:
        "マイク音量を自動で整えます。声の大きさが変わりやすい時や、入力レベルが安定しない時に向いています。",
    enableVadGate:
        "話していない時の送信を抑えます。無音でも反応しやすい環境で、誤反応を減らしたい時に向いています。",
    enableVenueNoiseMode:
        "反射音や周囲のざわつきが多い場所向けの調整です。イベント会場や広い部屋で使う時に試してください。",
    enableCharacter:
        "3Dキャラクターを表示します。動作を軽くしたい時や、音声まわりだけ確認したい時はオフにします。",
    enableCharacterGaze:
        "カメラから顔の向きや視線を読み取ります。顔の向きに合わせた演出や自動ミュートを使いたい時にオンにします。",
    enableSincroPoseTracking:
        "sincro で肩・上半身・腕の動きを低振幅で反映します。重い時や姿勢検出が不安定な時はオフにできます。",
    forceSincroPoseTracking:
        "低性能端末でのデバッグ用です。姿勢推論が遅くても face-only へ自動降格せず、PoseLandmarker の出力を観測し続けます。",
    enableAutoMute:
        "顔の向きに合わせて自動でミュートを切り替えます。展示やハンズフリー運用で、話していない時を静かにしたい場面に向いています。",
    characterMotionScale:
        "呼吸、聞き姿勢、AI発話中の上半身モーションの強さです。前後の揺れが大きい時は下げます。",
    sincroPoseRetargetScale:
        "sincro の姿勢同期をキャラクターへ反映する強さです。腕や肩が動きすぎる時は下げます。",
    characterEyeTrackingScale:
        "顔位置に追従する eyeball の動きの強さです。視線が動きすぎる時は下げます。",
    enableVR: "VR で開くための準備を行います。VR 対応ページを使う時だけオンにします。",
    lgTileHeight:
        "Looking Glass のタイル解像度の高さです。高いほど精細になりますが負荷が増えます。まずは既定値から調整してください。",
    lgNumViews:
        "Looking Glass の視差ビュー数です。多いほど滑らかな立体感になりますが描画負荷が増えます。",
    lgTargetY:
        "Looking Glass 表示時の注視高さ（Y）です。キャラクターの顔位置に合わせて微調整すると見やすくなります。",
    lgTargetZ:
        "Looking Glass 表示時の注視奥行き（Z）です。ピンボケや前後の見え方が不自然な場合に、少しずつ調整してください。",
    lgTargetDiam:
        "Looking Glass の注視範囲（target diameter）です。焦点が合いにくい時は小さめ/大きめに振って見え方を確認してください。",
    lgDepthiness:
        "Looking Glass の奥行き強調量です。立体感を強くしたい時に上げ、破綻が出る場合は下げます。",
    lgFovyDeg:
        "Looking Glass 用の縦方向視野角（FOV Y）です。被写体の見え方が窮屈/広すぎる場合に調整します。",
} as const;
