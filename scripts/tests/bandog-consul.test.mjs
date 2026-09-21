/** 隔離したConsulとHTTP代役で、実際のDNS監視の欠損・停止・復旧を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

const docker = (...args) =>
	execFileSync("docker", args, { encoding: "utf8" }).trim();

test("bandogはチャット基盤の未登録・異常を検知し、復旧後に正常へ戻る", {
	timeout: 240000,
}, async () => {
	const network = `bandog-test-${process.pid}`;
	const consul = `${network}-consul`;
	const bandog = `${network}-bandog`;
	const agent = `${network}-agent`;
	const llama = `${network}-llama`;
	const image = "hashicorp/consul:latest";
	const mockImage = "ghcr.io/sincromisor/agent-server:latest";
	// 既存ローカルイメージだけを使い、実サービスの停止やモデル取得を避ける。
	const api = (path) =>
		docker("exec", consul, "wget", "-qO-", `http://127.0.0.1:8500/v1/${path}`);
	const waitFor = async (predicate) => {
		for (let i = 0; i < 60; i++) {
			try {
				if (predicate()) return;
			} catch {
				/* 起動中の接続失敗も期限内は待つ。 */
			}
			await setTimeout(1000);
		}
		assert.fail("Consulまたはbandogが期待状態へ遷移しない");
	};
	const status = (count) =>
		waitFor(
			() => docker("exec", bandog, "cat", "/services.status") === String(count),
		);
	const check = (name, expected) =>
		waitFor(() =>
			JSON.parse(api(`health/checks/${name}`)).some(
				(item) => item.Status === expected,
			),
		);
	docker("network", "create", network);
	try {
		for (const [name, alias, port] of [
			[agent, "agent-server", 4111],
			[llama, "llama-server", 8080],
		]) {
			docker(
				"run",
				"-d",
				"--pull=never",
				"--name",
				name,
				"--network",
				network,
				"--network-alias",
				alias,
				"--entrypoint",
				"node",
				mockImage,
				"-e",
				`require('http').createServer((q,r)=>{r.statusCode=require('fs').existsSync('/tmp/loading')?503:200;r.end('ok')}).listen(${port},'0.0.0.0')`,
			);
		}
		docker(
			"run",
			"-d",
			"--pull=never",
			"--name",
			consul,
			"--network",
			network,
			"-v",
			`${resolve("Docker/agent-server/consul-service.json")}:/consul/config/agent.json:ro`,
			"-v",
			`${resolve("Docker/agent-server/consul-llama-service.json")}:/consul/config/llama.json:ro`,
			image,
			"agent",
			"-dev",
			"-client=0.0.0.0",
		);
		await check("LlamaServer", "passing");
		await check("AgentServer", "passing");
		// 今回の対象外サービスは正常な登録で固定し、既存対象の監視も通す。
		for (const name of [
			"RTCSignalingServer",
			"SincroFrontend",
			"SincroRedis",
			"SincroS3",
			"SincroVoiceVox",
			"SpeechExtractor",
			"SpeechRecognizer",
			"TextProcessor",
			"VoiceSynthesizer",
			"SincroLogs",
			"SincroLogCollector",
			"SincroLogRouter",
			"SincroLogObserver",
		]) {
			docker(
				"exec",
				consul,
				"sh",
				"-c",
				'printf "%s" "$1" > /tmp/service.json',
				"sh",
				JSON.stringify({ service: { name, address: "127.0.0.1", port: 80 } }),
			);
			docker(
				"exec",
				consul,
				"consul",
				"services",
				"register",
				"/tmp/service.json",
			);
		}
		docker(
			"run",
			"-d",
			"--pull=never",
			"--name",
			bandog,
			"--network",
			network,
			"-e",
			`CONSUL_DNS_ADDR=${consul}:8600`,
			"-v",
			`${resolve("Docker/consul/bandog.sh")}:/bandog.sh:ro`,
			image,
			"sh",
			"/bandog.sh",
		);
		await status(0);
		docker("exec", llama, "touch", "/tmp/loading");
		await check("LlamaServer", "critical");
		await status(1);
		docker("exec", llama, "rm", "/tmp/loading");
		await check("LlamaServer", "passing");
		await status(0);
		for (const [container, name] of [
			[agent, "AgentServer"],
			[llama, "LlamaServer"],
		]) {
			docker("stop", "-t", "1", container);
			await check(name, "critical");
			await status(1);
			docker("start", container);
			await check(name, "passing");
			await status(0);
		}
		for (const id of ["agent-server", "llama-server"])
			docker("exec", consul, "consul", "services", "deregister", `-id=${id}`);
		await status(2);
		const events = docker("logs", bandog)
			.split("\n")
			.filter(Boolean)
			.map(JSON.parse);
		const transitions = events.filter(
			(row) => row.target_service === "LlamaServer",
		);
		assert.deepEqual(
			transitions.map((row) => row.status),
			["passing", "critical", "passing", "critical", "passing", "critical"],
		);
		assert.ok(
			transitions.every((row) => row.event === "bandog_dns" && !row.host),
		);
		docker("restart", consul);
		await check("LlamaServer", "passing");
		await check("AgentServer", "passing");
		await status(0);
	} finally {
		docker("rm", "-f", bandog, consul, agent, llama);
		docker("network", "rm", network);
	}
});
