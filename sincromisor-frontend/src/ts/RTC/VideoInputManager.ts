// CharacterGaze 用のカメラ取得を専用管理する helper。
// 音声用 getUserMedia と切り離し、選択カメラの再取得/解放を安全に行う。
export class VideoInputManager {
    private videoTrack: MediaStreamTrack | null = null;
    private videoInputDeviceId: string | undefined;

    setVideoInputDeviceId(deviceId: string | undefined): void {
        this.videoInputDeviceId = deviceId && deviceId.trim() !== "" ? deviceId : undefined;
    }

    getVideoInputDeviceId(): string | undefined {
        return this.videoInputDeviceId;
    }

    async reacquireVideoTrack(): Promise<MediaStreamTrack> {
        const previousTrack = this.videoTrack;
        const nextStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: this.buildVideoConstraints(),
        });
        const nextTrack = nextStream.getVideoTracks()[0];
        if (!nextTrack) {
            throw new Error("選択されたカメラから映像トラックを取得できませんでした。");
        }

        this.videoTrack = nextTrack;
        if (previousTrack && previousTrack !== nextTrack) {
            previousTrack.stop();
        }
        return nextTrack;
    }

    releaseVideoTrack(): void {
        this.videoTrack?.stop();
        this.videoTrack = null;
    }

    private buildVideoConstraints(): MediaTrackConstraints {
        if (this.videoInputDeviceId) {
            return {
                width: 320,
                height: 240,
                deviceId: { exact: this.videoInputDeviceId },
            };
        }
        return {
            width: 320,
            height: 240,
        };
    }
}
