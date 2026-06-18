import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { untrackedContentHash } from "../gate.mjs";

/** 一時 git リポジトリを作り、初期コミット（tracked ファイル 1 件）まで用意する。 */
function initRepo() {
    const dir = mkdtempSync(path.join(tmpdir(), "gate-untracked-"));
    const git = (...args) => {
        const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
        if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    };
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "tester");
    writeFileSync(path.join(dir, "tracked.txt"), "tracked-initial\n");
    git("add", "tracked.txt");
    git("commit", "-q", "-m", "init");
    return dir;
}

describe("untrackedContentHash", () => {
    let repo;
    const repos = [];

    beforeEach(() => {
        repo = initRepo();
        repos.push(repo);
    });

    afterEach(() => {
        for (const d of repos.splice(0)) {
            try {
                rmSync(d, { recursive: true, force: true });
            } catch {
                /* ignore cleanup errors */
            }
        }
    });

    test("clean ツリー（未追跡無し）では安定した空リストハッシュを返す", () => {
        const a = untrackedContentHash(repo);
        const b = untrackedContentHash(repo);
        expect(a).toBe(b);
        const repo2 = initRepo();
        repos.push(repo2);
        expect(untrackedContentHash(repo2)).toBe(a);
    });

    test("tracked のみ変更（未追跡無し）では空リストハッシュのまま変わらない", () => {
        const before = untrackedContentHash(repo);
        writeFileSync(path.join(repo, "tracked.txt"), "tracked-modified\n");
        expect(untrackedContentHash(repo)).toBe(before);
    });

    test("未追跡ファイルの追加で hash が変わる", () => {
        const before = untrackedContentHash(repo);
        writeFileSync(path.join(repo, "new.txt"), "hello\n");
        expect(untrackedContentHash(repo)).not.toBe(before);
    });

    test("未追跡ファイルの内容変更で hash が変わる（陳腐化キャッシュ防止）", () => {
        writeFileSync(path.join(repo, "new.txt"), "v1\n");
        const v1 = untrackedContentHash(repo);
        writeFileSync(path.join(repo, "new.txt"), "v2\n");
        expect(untrackedContentHash(repo)).not.toBe(v1);
    });

    test("未追跡ファイルの削除で hash が変わる（追加前の値へ戻る）", () => {
        const empty = untrackedContentHash(repo);
        const p = path.join(repo, "new.txt");
        writeFileSync(p, "x\n");
        expect(untrackedContentHash(repo)).not.toBe(empty);
        rmSync(p);
        expect(untrackedContentHash(repo)).toBe(empty);
    });

    test("既存未追跡ディレクトリへの追加でも変わる（ディレクトリ畳み込みを回避）", () => {
        mkdirSync(path.join(repo, "untracked-dir"));
        writeFileSync(path.join(repo, "untracked-dir", "a.txt"), "a\n");
        const one = untrackedContentHash(repo);
        writeFileSync(path.join(repo, "untracked-dir", "b.txt"), "b\n");
        expect(untrackedContentHash(repo)).not.toBe(one);
    });

    test("列挙順に依存しない（決定的）: 追加順が違っても同じ hash", () => {
        const repoX = initRepo();
        const repoY = initRepo();
        repos.push(repoX, repoY);
        writeFileSync(path.join(repoX, "a.txt"), "A\n");
        writeFileSync(path.join(repoX, "b.txt"), "B\n");
        writeFileSync(path.join(repoY, "b.txt"), "B\n");
        writeFileSync(path.join(repoY, "a.txt"), "A\n");
        expect(untrackedContentHash(repoX)).toBe(untrackedContentHash(repoY));
    });

    test("gitignore 対象の未追跡ファイルは hash に含めない（既知制約の維持）", () => {
        writeFileSync(path.join(repo, ".gitignore"), "ignored.txt\n");
        spawnSync("git", ["add", ".gitignore"], { cwd: repo });
        spawnSync("git", ["commit", "-q", "-m", "add gitignore"], { cwd: repo });
        const before = untrackedContentHash(repo);
        writeFileSync(path.join(repo, "ignored.txt"), "secret\n");
        expect(untrackedContentHash(repo)).toBe(before);
    });

    test("読み取れない未追跡ファイルでもエラーにならず差が出る（unreadable マーカー）", () => {
        const p = path.join(repo, "locked.txt");
        writeFileSync(p, "secret\n");
        chmodSync(p, 0o000);
        let readable = true;
        try {
            readFileSync(p);
        } catch {
            readable = false;
        }
        if (readable) return; // 権限が効かない環境ではスキップ
        const emptyRepo = initRepo();
        repos.push(emptyRepo);
        const empty = untrackedContentHash(emptyRepo);
        const withLocked = untrackedContentHash(repo);
        expect(withLocked).not.toBe(empty);
        expect(typeof withLocked).toBe("string");
        chmodSync(p, 0o600);
    });
});
