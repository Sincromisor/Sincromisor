/** 初回準備、再利用、取得失敗と破損時の停止を、実行用コンテナで確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";

test("配布設定だけでchatを含む全体を起動し、初期化と同じ保存先を使う", () => {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) => !/^(COMPOSE_|SINCRO_)/.test(key),
		),
	);
	const { services } = JSON.parse(
		execFileSync(
			"docker",
			[
				"compose",
				"--env-file",
				"examples/compose.env",
				"config",
				"--format",
				"json",
			],
			{ env, encoding: "utf8" },
		),
	);
	for (const name of [
		"sincro-frontend",
		"sincro-rtc",
		"speech-recognizer",
		"text-processor",
		"agent-server",
		"llama-server",
	])
		assert(services[name]);
	assert(services["sincro-rtc"].command.includes("127.0.0.1"));
	assert.equal(
		services["sincro-rtc"].command[
			services["sincro-rtc"].command.indexOf("--stun") + 1
		],
		"",
	);
	for (const name of ["text-processor", "agent-server"]) {
		assert.equal(
			services[name].depends_on["service-initializer"].condition,
			"service_completed_successfully",
		);
		assert.deepEqual(services[name].entrypoint, ["sh", "/with-token.sh"]);
		assert(services[name].command.length > 0);
		assert(
			services[name].volumes.some(
				(v) => v.source === "service-auth" && v.read_only,
			),
		);
	}
	// Composeの正規化出力は作成フラグを省略する版があるため、指定自体も確認する。
	for (const name of ["llama-server", "speech-recognizer"]) {
		const config = parse(readFileSync(`compose/${name}.yml`, "utf8"));
		assert.equal(config.services[name].volumes[0].bind.create_host_path, true);
	}
	for (const name of [
		"speech-recognizer",
		"voice-synthesizer",
		"s3-bootstrap",
	]) {
		assert(
			services[name].volumes.some((v) => v.source === "s3-auth" && v.read_only),
		);
		assert(!services[name].volumes.some((v) => v.source === "service-auth"));
		assert.deepEqual(services[name].entrypoint, ["sh", "/with-s3-secret.sh"]);
		assert(services[name].command.length > 0);
	}
	assert.equal(
		services["s3-bootstrap"].depends_on["s3-credential-initializer"].condition,
		"service_completed_successfully",
	);
	assert(
		services["seaweed-master"].volumes.some(
			(v) => v.source === "sincro-s3-master-data" && v.target === "/data",
		),
	);
	assert(
		services["seaweed-filer"].volumes.some(
			(v) => v.source === "sincro-s3-filer-data" && v.target === "/data",
		),
	);
	const init = services["service-initializer"];
	assert.equal(init.user, "0:0");
	assert.equal(
		init.volumes.find((v) => v.target === "/cache").source,
		services["speech-recognizer"].volumes[0].source,
	);
});

test("初期化と認証の受け渡しは再実行でき、失敗したモデルを完成扱いしない", () => {
	const checks = `
set -eu
mkdir /cache /auth /models
sh /initialize.sh services
test "$(stat -c %u /cache)" = 1001
test "$(stat -c %a /auth/token)" = 444
test "$(wc -c < /auth/token)" = 64
cp /auth/token /original-token
# 再起動時に既存ファイルと所有者を維持する。
chown 1234:1234 /cache
sh /initialize.sh services
test "$(stat -c %u /cache)" = 1234
cmp /original-token /auth/token
ln -s /auth /run/sincromisor-auth
sh /with-token.sh sh -c 'test "$SINCRO_AGENT_ADMIN_TOKEN" = "$(cat /auth/token)"; test "$SINCRO_PROCESSOR_MASTRA_TOKEN" = "$SINCRO_AGENT_ADMIN_TOKEN"'
SINCRO_AGENT_ADMIN_TOKEN=explicit-admin SINCRO_PROCESSOR_MASTRA_TOKEN=explicit-processor sh /with-token.sh sh -c 'test "$SINCRO_AGENT_ADMIN_TOKEN" = explicit-admin; test "$SINCRO_PROCESSOR_MASTRA_TOKEN" = explicit-processor'
mv /auth/token /auth/saved-token
if sh /with-token.sh true; then exit 1; fi
mv /auth/saved-token /auth/token
# 通信失敗時の途中ファイルは、正常モデルへ昇格しない。
mkdir /fake-bin
printf '#!/bin/sh\nprintf incomplete > /models/gemma-4-E2B-it-Q4_0.gguf.part\nexit 22\n' > /fake-bin/curl
chmod +x /fake-bin/curl
if PATH=/fake-bin:$PATH sh /initialize.sh llama; then exit 1; fi
test ! -e /models/gemma-4-E2B-it-Q4_0.gguf
# HTTPが成功しても検証不一致なら停止し、再実行でも破損ファイルを維持する。
printf '#!/bin/sh\nprintf corrupt > /models/gemma-4-E2B-it-Q4_0.gguf.part\n' > /fake-bin/curl
if PATH=/fake-bin:$PATH sh /initialize.sh llama; then exit 1; fi
test ! -e /models/gemma-4-E2B-it-Q4_0.gguf
mv /models/gemma-4-E2B-it-Q4_0.gguf.part /models/gemma-4-E2B-it-Q4_0.gguf
if sh /initialize.sh llama; then exit 1; fi
test "$(cat /models/gemma-4-E2B-it-Q4_0.gguf)" = corrupt
printf custom > /models/custom.gguf
SINCRO_LLAMA_MODEL_FILE=custom.gguf sh /initialize.sh llama
if SINCRO_LLAMA_MODEL_FILE=missing.gguf sh /initialize.sh llama; then exit 1; fi
if SINCRO_LLAMA_MODEL_FILE=../custom.gguf sh /initialize.sh llama; then exit 1; fi
`;
	execFileSync(
		"docker",
		[
			"run",
			"--rm",
			"--network",
			"none",
			"--user",
			"0:0",
			"--entrypoint",
			"sh",
			"-v",
			`${resolve("Docker/service-initializer/initialize.sh")}:/initialize.sh:ro`,
			"-v",
			`${resolve("Docker/service-initializer/with-token.sh")}:/with-token.sh:ro`,
			"curlimages/curl:8.12.1",
			"-c",
			checks,
		],
		{ encoding: "utf8", stdio: "pipe" },
	);
});
