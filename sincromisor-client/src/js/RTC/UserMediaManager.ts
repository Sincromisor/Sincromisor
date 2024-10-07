export class UserMediaManager {
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
    config: MediaStreamConstraints;

    constructor() {
        this.videoTrack = null;
        this.audioTrack = null;
        this.config = this.defaultConfig();
    }

    static hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    defaultConfig(): MediaStreamConstraints {
        return {
            /*
                ビデオを有効にし解像度を指定する場合は
                {"width": 320, "height": 240}
            */
            "video": { "width": 320, "height": 240 },
            "audio": true
        }
    }

    getUserMedia(audioTrackCallback: (audioTrack: MediaStreamTrack) => void,
        videoTrackCallback: (videoTrack: MediaStreamTrack) => void,
        errCallback: (err: any) => void): void {
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

    disableVideo(): void {
        this.config["video"] = false;
    }

    close(): void {
        if (this.videoTrack) {
            this.videoTrack.stop();
            this.videoTrack = null;
        }
        if (this.audioTrack) {
            this.audioTrack.stop();
            this.videoTrack = null;
        }
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
