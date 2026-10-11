/** 実ホストの過去ログ走査を避けつつ、試験開始後の原本は停止・再作成をまたいで回収する。 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function scopeJournalFixture(vector, directory) {
	const mount = vector.volumes.find(
		(volume) => volume.target === "/etc/vector/vector.toml",
	);
	const original = readFileSync(mount.source, "utf8");
	const args = 'extra_args = ["--merge"]';
	assert.ok(original.includes(args));
	// since_nowは変更しない。初回だけ過去原本を絞り、再開時は永続cursorを使う。
	const since = new Date(Date.now() - 60000).toISOString();
	const path = join(directory, "vector.toml");
	writeFileSync(
		path,
		original.replace(args, `extra_args = ["--merge", "--since=${since}"]`),
	);
	mount.source = path;
	// 再作成後は永続cursorの--after-cursorと--sinceを併用できないため、本番設定へ戻す。
	return () => {
		writeFileSync(path, original);
	};
}
