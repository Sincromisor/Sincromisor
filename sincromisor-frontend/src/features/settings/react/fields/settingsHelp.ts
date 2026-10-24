/** 項目名だけでは分からない調整の目安と制約を、起動前・常設設定の補足で共有する。 */
export const settingHelp = {
    titleText:
        "会話UIなどに表示されるタイトル文字列です。配信名・キャラクター名を表示したい時に設定します。",
    audioInputDeviceId:
        "使うマイクを選びます。未選択ならブラウザで既定になっているマイクを使います。",
    videoInputDeviceId:
        "顔の向き・視線・姿勢の追跡に使うカメラを選びます。未選択ならブラウザで既定になっているカメラを使います。",
    enableVenueNoiseMode: "フィルターと音声区間の検出しきい値をまとめて調整します。",
    forceSincroPoseTracking:
        "低性能端末でのデバッグ用です。姿勢推論が遅くても face-only へ自動降格せず、PoseLandmarker の出力を観測し続けます。",
    characterMotionScale:
        "呼吸、聞き姿勢、AI発話中の上半身モーションの強さです。前後の揺れが大きい時は下げます。",
    sincroPoseRetargetScale:
        "「キャラクターになる」で姿勢をキャラクターへ反映する強さです。腕や肩が動きすぎる時は下げます。",
    characterEyeTrackingScale:
        "顔位置に追従する目線の動きの強さです。視線が動きすぎる時は下げます。",
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
