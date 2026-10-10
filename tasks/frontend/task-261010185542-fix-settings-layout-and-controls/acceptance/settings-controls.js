async (page) => {
	// 一時ブラウザー専用。保存値の精度、入力・ストア・表示の一致、タブのキー操作を検証する。
	const storageKey = "sincromisor:settings:simple-vrm";
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("http://127.0.0.1:5173/simple-vrm/");
	await page.evaluate((key) => localStorage.removeItem(key), storageKey);
	await page.reload();
	const shell = page.locator(".settingsShell--startupDialog");
	const tabs = shell.getByRole("tab");
	await tabs.first().focus();
	for (const [key, label] of [
		["ArrowRight", "デバイス"],
		["ArrowLeft", "会話"],
		["End", "接続"],
		["ArrowRight", "会話"],
		["Home", "会話"],
	]) {
		await page.keyboard.press(key);
		const selected = shell.getByRole("tab", { selected: true });
		if (
			(await selected.textContent()) !== label ||
			!(await selected.evaluate((el) => el === document.activeElement))
		)
			throw new Error(`タブ選択とフォーカスが不一致: ${key}`);
	}
	await page.keyboard.press("Tab");
	if (
		!(await shell
			.getByRole("tabpanel")
			.evaluate((el) => el === document.activeElement))
	)
		throw new Error("Tabで本文へ移動できない");
	for (const label of ["タイトル", "トークモード (talk mode)"])
		if ((await shell.getByLabel(label, { exact: true }).count()) !== 1)
			throw new Error(`ラベルの関連付け: ${label}`);
	await shell.getByRole("tab", { name: "デバイス", exact: true }).click();
	for (const label of ["マイク入力", "視線用カメラ"])
		if ((await shell.getByLabel(label, { exact: true }).count()) !== 1)
			throw new Error(`ラベルの関連付け: ${label}`);
	const keys = [
		"characterMotionScale",
		"sincroPoseRetargetScale",
		"characterEyeTrackingScale",
	];
	const labels = ["上半身モーション", "姿勢同期", "目線追跡"];
	const checkValues = async (expected) => {
		await shell.getByRole("tab", { name: "表示", exact: true }).click();
		const snapshot = await page.evaluate(async () => {
			const { SincroAppController } = await import(
				"/app/controller/sincroAppController.ts"
			);
			return SincroAppController.getCurrent().settingsStore.getSnapshot()
				.settings;
		});
		for (let index = 0; index < keys.length; index++) {
			const input = shell.getByRole("slider", {
				name: labels[index],
				exact: true,
			});
			const value = Number(await input.inputValue());
			const display = await input
				.locator("..")
				.locator(".settingsPrimitiveRange__value")
				.textContent();
			if (
				value !== expected[index] ||
				snapshot[keys[index]] !== value ||
				Math.abs(Number(display.replace("%", "")) / 100 - value) > 1e-12
			)
				throw new Error(`数値不一致: ${keys[index]} / ${value} / ${display}`);
			if (
				(await shell
					.getByRole("button", {
						name: `${labels[index]}の説明を表示`,
						exact: true,
					})
					.count()) !== 1
			)
				throw new Error("説明ボタン名の欠落");
		}
	};
	await checkValues([0.72, 0.68, 0.68]);
	await page.evaluate(
		({ key, keys }) =>
			localStorage.setItem(
				key,
				JSON.stringify({
					version: 1,
					settings: Object.fromEntries(
						keys.map((name, index) => [name, [0.725, 0.683, 0.917][index]]),
					),
				}),
			),
		{ key: storageKey, keys },
	);
	await page.reload();
	await checkValues([0.725, 0.683, 0.917]);
	for (let index = 0; index < labels.length; index++)
		await shell
			.getByRole("slider", { name: labels[index], exact: true })
			.fill(String([0.834, 0.456, 0.999][index]));
	await checkValues([0.83, 0.46, 1]);
	await page.reload();
	await checkValues([0.83, 0.46, 1]);
	const range = shell.getByRole("slider", { name: labels[0], exact: true });
	await range.focus();
	await page.keyboard.press("ArrowRight");
	await checkValues([0.84, 0.46, 1]);
	await page
		.locator("#configurationDialog")
		.evaluate((dialog) => dialog.close());
	await page.getByRole("button", { name: /右側ツールメニューを開く/ }).click();
	await page.getByRole("menuitem", { name: /開発者ツール/ }).click();
	const debug = page.getByRole("dialog", { name: /開発者ツール/ });
	const debugTabs = debug.getByRole("tab");
	await debugTabs.first().focus();
	for (const key of ["ArrowRight", "End", "Home"]) {
		await page.keyboard.press(key);
		if (
			!(await debug
				.getByRole("tab", { selected: true })
				.evaluate((el) => el === document.activeElement))
		)
			throw new Error(`診断タブのフォーカス不一致: ${key}`);
	}
	return "PASS: ラベル、矢印/Home/End/Tab、既定値・保存値・入力・再読込・ストア一致、診断タブ";
};
