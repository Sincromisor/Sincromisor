export class UserMediaManager {
    constructor() {
        this.videoTrack = null;
        this.audioTrack = null;
        this.hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
        this.config = this.defaultConfig();
    }

    defaultConfig() {
        return {
            /*
                ビデオを有効にし解像度を指定する場合は
                {"width": 320, "height": 240}
            */
            "video": { "width": 320, "height": 240 },
            "audio": true
        }
    }

    getUserMedia(audioTrackCallback, videoTrackCallback, errCallback) {
        navigator.mediaDevices.getUserMedia(this.config)
            .then((mediaStream) => {
                mediaStream.getTracks().forEach((track) => {
                    if (track.kind == 'audio') {
                        console.log(`AudioTrack: ${track.label}`);
                        this.audioTrack = track;
                        audioTrackCallback(this.audioTrack);
                    } else if (track.kind == 'video') {
                        console.log(`VideoTrack: ${track.label}`);
                        this.videoTrack = track;
                        videoTrackCallback(this.videoTrack);
                    } else {
                        console.error(`Unknown Track: ${track}`);
                    }
                });

            }).catch((err) => {
                console.error(`Could not acquire media: ${err}`);
                errCallback(err);
            })
    }

    disableVideo() {
        this.config["video"] = false;
    }
}

/*
    medisStreamTrack = {
        "enabled": true, // 一般的な意味でのmuteはこちらを操作
        "id": "{5b26b865-8350-45f3-b3bf-bd2535384246}",
        "kind": "audio",
        "label": "マイク (webcam Audio)",
        "muted": false, // 「技術的な問題でこのトラックがメディアデータを提供できないかどうかを示す論理値」
        "onended": null,
        "onmute": null,
        "onunmute": null,
        "readyState": "live"
    }
*/
