export function GazePreview() {
    return (
        <div id="characterGaze">
            {/* biome-ignore lint/a11y/useMediaCaption: カメラ追跡用プレビューであり、音声や字幕対象の映像ではない。 */}
            <video id="characterGazeVideo" autoPlay={true} playsInline={true}></video>
            <svg
                id="characterGazeMarker"
                viewBox="0 0 320 240"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
            >
                <title>Character gaze target marker</title>
                <circle id="eyeTarget" cx="50%" cy="50%" r="5" fill="hsl(300 100% 50% / 50%)" />
            </svg>
        </div>
    );
}
