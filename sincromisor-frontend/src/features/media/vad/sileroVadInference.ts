/** 同梱Silero ONNXの16kHz連続入力を扱う。Workerがセッションの生成・破棄と実行の直列化を所有する。 */
import { Tensor } from "onnxruntime-web/wasm";

/** 同梱モデルの固定した入出力だけを使う推論境界。未知のモデルを推測で補完しない。 */
type SileroSession = {
    inputNames: readonly string[];
    outputNames: readonly string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
};

/** 32msの音声と直前4msの文脈、再帰状態を保持する。失敗は呼出元のRMS代替処理へ伝える。 */
export class SileroVadInference {
    private state: Tensor = new Tensor("float32", new Float32Array(256), [2, 1, 128]);
    private context = new Float32Array(64);
    private generation = 0;
    private readonly session: SileroSession;

    /** 対応モデルの名前を検証する。セッションの解放は所有者のWorker終了に委ねる。 */
    constructor(session: SileroSession) {
        if (
            !["input", "state", "sr"].every((name) => session.inputNames.includes(name)) ||
            !["output", "stateN"].every((name) => session.outputNames.includes(name))
        ) {
            throw new Error("Unsupported Silero VAD model contract");
        }
        this.session = session;
    }

    /** 入力切替時に呼ぶ。進行中の推論は取り消せないため世代を進め、その結果を無効にする。 */
    reset(): void {
        this.generation += 1;
        this.state = new Tensor("float32", new Float32Array(256), [2, 1, 128]);
        this.context = new Float32Array(64);
    }

    /** 16kHzの連続512サンプルを直列に渡す。リセットを跨いだ結果はundefined、不正出力は例外。 */
    async infer(frame: Float32Array): Promise<number | undefined> {
        if (frame.length !== 512) throw new Error("Silero VAD requires 512 samples at 16kHz");
        const generation = this.generation;
        const input = new Float32Array(576);
        input.set(this.context);
        input.set(frame, 64);
        const result = await this.session.run({
            input: new Tensor("float32", input, [1, 576]),
            state: this.state,
            sr: new Tensor("int64", new BigInt64Array([16000n]), []),
        });
        if (generation !== this.generation) return undefined;
        const probability = Number(result.output?.data[0]);
        const state = result.stateN;
        if (
            !Number.isFinite(probability) ||
            !state ||
            state.type !== "float32" ||
            state.dims.join(",") !== "2,1,128"
        ) {
            throw new Error("Invalid Silero VAD output");
        }
        // 確率と状態は別出力。確率を返す前に必ず両方を受け取り、次のフレームへ文脈を残す。
        this.state = state;
        this.context.set(frame.subarray(448));
        return Math.max(0, Math.min(1, probability));
    }
}
