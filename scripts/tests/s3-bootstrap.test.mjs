/** 実SeaweedFSで自動キー、変更後の旧キー拒否、再作成後のデータ保持を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const docker = (args) =>
	execFileSync("docker", args, { encoding: "utf8", stdio: "pipe" });
const mount = (path, target) => ["-v", `${resolve(path)}:${target}:ro`];

test("S3の自動キーを維持し、変更・再作成後もオブジェクトを読める", {
	timeout: 120000,
}, () => {
	const name = `sincro-s3-secret-test-${process.pid}`;
	const auth = `${name}-auth`;
	const data = `${name}-data`;
	const secretMounts = [
		"-v",
		`${auth}:/run/sincromisor-s3-auth:ro`,
		...mount(
			"Docker/service-initializer/with-s3-secret.sh",
			"/with-s3-secret.sh",
		),
	];
	const explicitKey = "test-only-new-s3-secret-with-plus+and/slash=";
	const initialize = () =>
		docker([
			"run",
			"--rm",
			"--network",
			"none",
			"--user",
			"0:0",
			"--entrypoint",
			"sh",
			"-v",
			`${auth}:/auth`,
			...mount("Docker/service-initializer/initialize.sh", "/initialize.sh"),
			"curlimages/curl:8.12.1",
			"/initialize.sh",
			"s3",
		]);
	const start = () =>
		docker([
			"run",
			"-d",
			"--name",
			name,
			"--network",
			name,
			"--network-alias",
			"seaweed-master",
			"--network-alias",
			"seaweed-filer",
			"--network-alias",
			"sincro-s3",
			"-v",
			`${data}:/data`,
			"chrislusf/seaweedfs:latest",
			"server",
			"-ip=seaweed-filer",
			"-ip.bind=0.0.0.0",
			"-dir=/data",
			"-s3",
			"-s3.port=8333",
			"-filer",
		]);
	const ready = () =>
		docker([
			"run",
			"--rm",
			"--network",
			name,
			"curlimages/curl:8.12.1",
			"--fail",
			"--silent",
			"--retry",
			"30",
			"--retry-all-errors",
			"--retry-delay",
			"1",
			"--max-time",
			"2",
			"--output",
			"/dev/null",
			"http://sincro-s3:8333/status",
		]);
	const bootstrap = (key = "") =>
		docker([
			"run",
			"--rm",
			"--network",
			name,
			"--entrypoint",
			"sh",
			...secretMounts,
			...mount("Docker/seaweedfs/s3-bootstrap.sh", "/s3-bootstrap.sh"),
			"-e",
			`S3_SECRET_KEY=${key}`,
			"-e",
			"S3_USER=sincromisor",
			"-e",
			"S3_ACCESS_KEY=sincromisor",
			"-e",
			"S3_BUCKETS=speech-recognizer,voice-synthesizer",
			"-e",
			"S3_ACTIONS=Read,Write,List",
			"chrislusf/seaweedfs:latest",
			"/with-s3-secret.sh",
			"sh",
			"/s3-bootstrap.sh",
		]);
	const request = (key = "", put = false) => {
		const output = docker([
			"run",
			"--rm",
			"--network",
			name,
			"--entrypoint",
			"sh",
			...secretMounts,
			"-e",
			`SINCRO_S3_SECRET_KEY=${key}`,
			"curlimages/curl:8.12.1",
			"/with-s3-secret.sh",
			"sh",
			"-c",
			`curl --silent --show-error --max-time 10 --aws-sigv4 aws:amz:us-east-1:s3 --user "sincromisor:$SINCRO_S3_SECRET_KEY" --write-out '\n%{http_code}' ${put ? "--request PUT --data-binary persisted-before-rotation" : ""} http://sincro-s3:8333/speech-recognizer/check.txt`,
		]);
		const boundary = output.lastIndexOf("\n");
		return {
			body: output.slice(0, boundary),
			status: Number(output.slice(boundary + 1)),
		};
	};
	const fingerprint = () =>
		docker([
			"run",
			"--rm",
			"--network",
			"none",
			"--entrypoint",
			"sha256sum",
			"-v",
			`${auth}:/auth:ro`,
			"curlimages/curl:8.12.1",
			"/auth/secret",
		]);
	try {
		docker(["network", "create", name]);
		initialize();
		const initial = fingerprint();
		initialize();
		assert.equal(fingerprint(), initial);
		start();
		ready();
		assert(!bootstrap().includes("secretKey"));
		assert.equal(request("", true).status, 200);
		bootstrap(explicitKey);
		assert.equal(request().status, 403);
		assert.deepEqual(request(explicitKey), {
			status: 200,
			body: "persisted-before-rotation",
		});
		// down/upと同じくコンテナを作り直し、保存済みのオブジェクトとキーを確認する。
		docker(["rm", "-f", name]);
		start();
		ready();
		bootstrap(explicitKey);
		assert.deepEqual(request(explicitKey), {
			status: 200,
			body: "persisted-before-rotation",
		});
		assert.equal(request().status, 403);
		assert.throws(() => bootstrap("invalid key\nwith-command"));
		assert.deepEqual(request(explicitKey), {
			status: 200,
			body: "persisted-before-rotation",
		});
		// 空欄へ戻すと、保存済みの自動キーを再利用する。
		bootstrap();
		assert.equal(fingerprint(), initial);
		assert.deepEqual(request(), {
			status: 200,
			body: "persisted-before-rotation",
		});
		assert.equal(request(explicitKey).status, 403);
	} finally {
		for (const args of [
			["rm", "-f", name],
			["volume", "rm", auth, data],
			["network", "rm", name],
		]) {
			try {
				docker(args);
			} catch {
				/* 起動前に失敗した場合の未作成リソースは無視する。 */
			}
		}
	}
});
