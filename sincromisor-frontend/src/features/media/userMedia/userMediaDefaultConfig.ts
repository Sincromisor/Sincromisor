export function createDefaultUserMediaConfig(): MediaStreamConstraints {
    return {
        /*
            ビデオを有効にし解像度を指定する場合は
            {"width": 320, "height": 240}
        */
        video: { width: 320, height: 240 },
        // イベント会場などの騒音環境を想定し、音声処理を明示指定する。
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            // AGCは環境ノイズを持ち上げることがあるため、まずは無効を既定にする。
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 48000,
            sampleSize: 16,
        },
    };
}
