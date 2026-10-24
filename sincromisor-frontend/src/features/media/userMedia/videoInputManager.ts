// CharacterGaze 用のカメラ取得を専用管理する helper。
// 音声用 getUserMedia と切り離し、選択カメラの再取得/解放を安全に行う。
export class VideoInputManager {
    private videoTrack?: MediaStreamTrack;
    private generation = 0;
    private videoInputDeviceId: string | undefined;

    /** 機器IDは次回の取得にだけ反映し、この操作だけでは取得を始めない。 */
    setVideoInputDeviceId(deviceId: string | undefined): void {
        this.videoInputDeviceId = deviceId && deviceId.trim() !== "" ? deviceId : undefined;
    }

    /** 取得失敗時の診断に使用する選択ID。 */
    getVideoInputDeviceId(): string | undefined {
        return this.videoInputDeviceId;
    }

    /** 新しい映像を受理して旧トラックを止める。終了後の後着ストリームは解放する。 */
    async reacquireVideoTrack(): Promise<MediaStreamTrack> {
        const generation = ++this.generation;
        const previousTrack = this.videoTrack;
        const nextStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: this.buildVideoConstraints(),
        });
        if (generation !== this.generation) {
            for (const track of nextStream.getTracks()) track.stop();
            throw new DOMException("Camera acquisition cancelled", "AbortError");
        }
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

    /** 取得待ちも無効化し、後着した映像を再使用させない。 */
    releaseVideoTrack(): void {
        ++this.generation;
        this.videoTrack?.stop();
        this.videoTrack = undefined;
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
