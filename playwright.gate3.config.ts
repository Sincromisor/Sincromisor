import { defineConfig } from "@playwright/test";

const chromiumBinary = process.env.SINCRO_GATE3_CHROMIUM_BINARY;
if (!chromiumBinary) {
    throw new Error("SINCRO_GATE3_CHROMIUM_BINARY is required.");
}

export default defineConfig({
    testDir: "./sincromisor-frontend/tests/gate3",
    timeout: 180_000,
    reporter: "line",
    workers: 1,
    use: {
        baseURL: process.env.SINCRO_GATE3_BASE_URL,
        browserName: "chromium",
        headless: true,
        launchOptions: {
            executablePath: chromiumBinary,
            args: [
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                `--use-file-for-fake-audio-capture=${process.env.SINCRO_GATE3_AUDIO_FIXTURE}`,
            ],
        },
        permissions: ["microphone"],
    },
});
