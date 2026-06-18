/**
 * タスク管理の共有ユーティリティ（Node / Bun どちらでも動作する純 ESM）。
 *
 * 依存は `yaml` パッケージのみ（`bun add yaml` または `npm i yaml`）。
 * Bun 専用 API は使わず、node:fs / node:path のみで実装している。
 *
 * meta の独自フィールド保全（保全制）:
 *   readMeta は既知 12 フィールド以外のトップレベルキーを `extra` として値・型を保ったまま
 *   収集し、stringifyMeta が出現順で末尾に出力する。これにより set/close が meta を書き戻して
 *   も導入先リポジトリの独自フィールド（過去タスク ID・外部管理 ID 等）が無言で消えない。
 *
 * レイアウト（正本）:
 *   <TASKS_ROOT>/<category>/<task-dir>/task.md    # 承認済み仕様（不変）
 *   <TASKS_ROOT>/<category>/<task-dir>/meta.yaml   # 可変ライフサイクル（status の正本）
 *   <TASKS_ROOT>/<category>/<task-dir>/review.md   # task-reviewer 出力
 *   <TASKS_ROOT>/<category>/<task-dir>/impl.md      # task-implementer 作業ログ
 *   <TASKS_ROOT>/<category>/<task-dir>/eval.md      # impl-evaluator 出力
 *   <TASKS_ROOT>/<category>/index.md                # genIndex.mjs が AUTOGEN ブロックを再生成
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

/** タスク群を格納するルートディレクトリ（リポジトリ相対）。プロジェクトに合わせて変更可。 */
export const TASKS_ROOT = process.env.TASKS_ROOT ?? "tasks";

export const STATUSES = ["open", "blocked", "done", "cancelled", "superseded"];

/** 終端ステータス（到達すると `closed_at` を持つ）。`open`/`blocked` は非終端。 */
export const TERMINAL_STATUSES = ["done", "cancelled", "superseded"];

// 一覧表示の並び順: 対応が必要なもの（open→blocked）を先頭、終端をその後ろ。
const STATUS_RANK = { open: 0, blocked: 1, done: 2, cancelled: 3, superseded: 4 };

/**
 * @typedef {Object} TaskMeta
 * @property {string} id           ディレクトリ名（`task-` 接頭辞込み）と一致する安定 ID
 * @property {string} title
 * @property {string} category
 * @property {"open"|"blocked"|"done"|"cancelled"|"superseded"} status
 * @property {string[]} depends_on  依存タスクの id 配列
 * @property {string|null} superseded_by
 * @property {string|null} review   APPROVED | NEEDS_REVISION | null
 * @property {string|null} reviewed_sha  review=APPROVED 判定時点の HEAD SHA（7〜40 桁 hex）| null。/run-task レビュー段のスキップ判定の基準
 * @property {string|null} verdict  PASS | FAIL | null
 * @property {number} attempts      再実装ループ回数
 * @property {string|null} created_at
 * @property {string|null} closed_at
 * @property {Record<string, unknown>} [extra]  既知 12 フィールド以外のトップレベルキー（保全用）
 */

/** 既知のトップレベルキー（この順序が stringifyMeta の決定的出力順になる）。 */
export const KNOWN_META_KEYS = [
    "id",
    "title",
    "category",
    "status",
    "depends_on",
    "superseded_by",
    "review",
    "reviewed_sha",
    "verdict",
    "attempts",
    "created_at",
    "closed_at",
];

/**
 * 生の YAML オブジェクトから既知キーを除いた残差を出現順で extra として抽出する。
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
function collectExtra(raw) {
    const known = new Set(KNOWN_META_KEYS);
    /** @type {Record<string, unknown>} */
    const extra = {};
    for (const key of Object.keys(raw)) {
        if (!known.has(key)) extra[key] = raw[key];
    }
    return extra;
}

/**
 * @typedef {Object} DiscoveredTask
 * @property {TaskMeta} meta
 * @property {string} metaPath   meta.yaml のパス
 * @property {string} dir         タスクディレクトリ
 * @property {string} taskMdPath  task.md のパス
 */

/** @returns {value is "open"|"blocked"|"done"|"cancelled"|"superseded"} */
export function isStatus(value) {
    return typeof value === "string" && STATUSES.includes(value);
}

/** meta.yaml を読み、欠落フィールドは安全なデフォルトで補完する。 */
export async function readMeta(metaPath) {
    const raw = yamlParse(await readFile(metaPath, "utf8")) ?? {};
    const dir = dirname(metaPath);
    const id = typeof raw.id === "string" ? raw.id : basename(dir);
    const status = isStatus(raw.status) ? raw.status : "open";
    const extra = collectExtra(raw);
    return {
        id,
        title: typeof raw.title === "string" ? raw.title : id,
        category: typeof raw.category === "string" ? raw.category : basename(dirname(dir)),
        status,
        depends_on: Array.isArray(raw.depends_on) ? raw.depends_on.map(String) : [],
        superseded_by: typeof raw.superseded_by === "string" ? raw.superseded_by : null,
        review: typeof raw.review === "string" ? raw.review : null,
        reviewed_sha: typeof raw.reviewed_sha === "string" ? raw.reviewed_sha : null,
        verdict: typeof raw.verdict === "string" ? raw.verdict : null,
        attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
        created_at: typeof raw.created_at === "string" ? raw.created_at : null,
        closed_at: typeof raw.closed_at === "string" ? raw.closed_at : null,
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
    };
}

/**
 * TaskMeta を決定的なキー順・ブロック形式の YAML 文字列にする。
 * 既知 12 フィールドを固定順で出力した後、`extra` の各キーを入力時の出現順で末尾に出力する。
 * `extra` が空（既知フィールドのみ）の場合の出力は現行と完全一致する（既存 task への回帰なし）。
 */
export function stringifyMeta(meta) {
    // 明示的な順序でオブジェクトを組む（yaml.stringify は挿入順を保つ）
    const ordered = {
        id: meta.id,
        title: meta.title,
        category: meta.category,
        status: meta.status,
        depends_on: meta.depends_on,
        superseded_by: meta.superseded_by,
        review: meta.review,
        reviewed_sha: meta.reviewed_sha,
        verdict: meta.verdict,
        attempts: meta.attempts,
        created_at: meta.created_at,
        closed_at: meta.closed_at,
    };
    // 既知キーの後に独自フィールド（extra）を出現順で追加する
    if (meta.extra) {
        for (const key of Object.keys(meta.extra)) {
            if (!(key in ordered)) ordered[key] = meta.extra[key];
        }
    }
    return yamlStringify(ordered);
}

/**
 * `package.json` の `taskMeta.customFields`（`string[]`）を読む。
 * setMeta が `key=value` で設定を許可する宣言済みカスタムフィールド名の集合。
 * 既存の gateSteps / evalWorktree と同じく package.json を設定の正本とする。
 * 未定義・不正な場合は空配列を返す（タイポ保護のため既定で何も許可しない）。
 * @param {string} [pkgPath]
 * @returns {Promise<string[]>}
 */
export async function readCustomFields(pkgPath = "package.json") {
    try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
        const fields = pkg?.taskMeta?.customFields;
        if (!Array.isArray(fields)) return [];
        return fields.filter((f) => typeof f === "string");
    } catch {
        return [];
    }
}

/**
 * close コミットで `git add` する対象パス集合を返す（純関数）。
 *
 * **自タスクディレクトリのみ**を返す（`task.md` / `meta.yaml` / `review.md` / `impl.md` /
 * `eval.md` / `acceptance/` を一括で含む）。グローバル index 再生成（`tasks:reindex`）は
 * close から完全分離したため、カテゴリ `index.md` は**意図的に含めない**。これにより
 * per-task close は互いに素なパスのみを触り、並列・worktree マージで衝突しない。
 *
 * 末尾スラッシュは正規化する（`git diff --cached --name-only` の判定と一致させるため）。
 * @param {string} taskDir
 * @returns {string[]}
 */
export function buildCloseCommitPaths(taskDir) {
    return [taskDir.replace(/\/+$/, "")];
}

/**
 * @typedef {Object} CloseCommitFacts
 * @property {string} id        タスク ID（`Refs:` と既定 `{id}` 展開に使う）
 * @property {"PASS"|"FAIL"} verdict
 * @property {number} attempts  再実装ループ回数
 * @property {string} taskDir   タスクディレクトリ（成果物ポインタの基点）
 */

/**
 * `package.json` の `taskClose.commitTemplate`（プレースホルダ付き文字列）を読む。
 * gateSteps / taskMeta.customFields と同じく cwd の package.json を設定の正本とする
 * （依存追加なし・JSON.parse のみで読む）。ファイル不在 / 未設定 / パース失敗の
 * いずれも `null` を返し、呼び出し側は既定 body にフォールバックする（close を落とさない）。
 * @param {string} [pkgPath]
 * @returns {Promise<string|null>}
 */
export async function readCommitTemplate(pkgPath = "package.json") {
    try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
        const tpl = pkg?.taskClose?.commitTemplate;
        return typeof tpl === "string" ? tpl : null;
    } catch {
        return null;
    }
}

/**
 * close コミットの **body**（subject の後段。subject は呼び出し側が現行どおり組む）を返す。
 * body は LLM 散文を含まない機械的事実のみ: `Verdict` / `Attempts` / `Refs: <id>` と
 * 成果物への 1 行ポインタ。Why/What/Risk は task.md / impl.md / eval.md（同コミット内）が
 * 正本であり、ここでは生成しない（drift 源にしない）。
 *
 * `template` を渡すと既定 body の代わりにプレースホルダ展開した文字列を返す。
 * 利用可能なプレースホルダ: `{id}` / `{verdict}` / `{attempts}` / `{taskDir}`。
 * 未知のプレースホルダ（例: `{unknown}`）はそのまま温存する（壊さない）。
 * @param {CloseCommitFacts} facts
 * @param {string|null} [template]
 * @returns {string}
 */
export function buildCloseCommitBody(facts, template) {
    const taskDir = facts.taskDir.replace(/\/+$/, "");
    if (template != null) {
        return template
            .replaceAll("{id}", facts.id)
            .replaceAll("{verdict}", facts.verdict)
            .replaceAll("{attempts}", String(facts.attempts))
            .replaceAll("{taskDir}", taskDir);
    }
    return [
        `Verdict: ${facts.verdict}`,
        `Attempts: ${facts.attempts}`,
        `Refs: ${facts.id}`,
        `See ${taskDir}/eval.md, impl.md`,
    ].join("\n");
}

/** 全カテゴリ配下の `task-*` ディレクトリを走査して DiscoveredTask[] を返す。 */
export async function discoverTasks(root = TASKS_ROOT) {
    /** @type {DiscoveredTask[]} */
    const out = [];
    for (const category of await listDirs(root)) {
        const catDir = join(root, category);
        for (const name of await listDirs(catDir)) {
            if (!name.startsWith("task-")) continue;
            const dir = join(catDir, name);
            const metaPath = join(dir, "meta.yaml");
            if (!existsSync(metaPath)) continue;
            const meta = await readMeta(metaPath);
            out.push({ meta, metaPath, dir, taskMdPath: join(dir, "task.md") });
        }
    }
    out.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    return out;
}

/** あるディレクトリ直下のサブディレクトリ名一覧（存在しなければ空配列）。 */
export async function listDirs(dir) {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
        return [];
    }
}

export function sortByStatusThenId(a, b) {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return r !== 0 ? r : a.id.localeCompare(b.id);
}

/** マークダウンのテーブルセルで安全に使えるようパイプ等をエスケープ。 */
export function mdCell(s) {
    return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

/** `from` ファイルから `to` ファイルへの POSIX 相対リンク（`./` 始まりを保証）。 */
export function relLink(fromFile, toFile) {
    let rel = relative(dirname(fromFile), toFile).split("\\").join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return rel;
}

/** ディレクトリを作成してからテキストを書き込む（mkdir -p 相当）。 */
export async function writeFileEnsured(filePath, content) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
}

/** YYYY-MM-DD（ローカル日付。newTask の timestamp と同じくローカル時刻基準）。 */
export function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
