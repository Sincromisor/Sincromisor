async (page) => {
	// playwright-cli run-code --filename <このファイル> で、起動前と常設設定の配置を再確認する。
	const results = [];
	for (const width of [1440, 1100, 520, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("http://127.0.0.1:5173/simple-vrm/");
		await page.locator("#configurationDialog[open]").waitFor();
		for (const mode of ["startup", "settings"]) {
			if (mode === "settings") {
				// 機器は起動せず、共通メニューから常設設定を開く。
				await page
					.locator("#configurationDialog")
					.evaluate((dialog) => dialog.close());
				await page
					.getByRole("button", { name: /右側ツールメニューを開く/ })
					.click();
				await page.getByRole("menuitem", { name: /基本設定/ }).click();
			}
			const shell = page.locator(
				mode === "startup"
					? ".settingsShell--startupDialog"
					: ".sincroControlPanel .settingsShell",
			);
			const rows = [];
			for (const id of [
				"conversation",
				"devices",
				"audio",
				"display",
				"connection",
			]) {
				const select = shell.locator("select.settingsShell__navSelect");
				if (await select.count()) await select.selectOption(id);
				else await shell.locator(`[role=tab][aria-controls$="-${id}"]`).click();
				const row = await shell.evaluate((element) => {
					const top = (selector) =>
						element.querySelector(selector)?.getBoundingClientRect().top;
					const scroll = element.querySelector(".settingsShell__detailScroll");
					const tabs = [...element.querySelectorAll('[role="tab"]')].filter(
						(tab) => tab.checkVisibility({ visibilityProperty: true }),
					);
					return {
						header: top(".settingsShell__header"),
						nav: top(".settingsShell__navigation"),
						footer: top(".settingsShell__footer"),
						compact: element
							.querySelector(".settingsShell__navigation")
							.classList.contains("is-compact"),
						rows: new Set(tabs.map((tab) => tab.getBoundingClientRect().top))
							.size,
						scroll: scroll.scrollHeight > scroll.clientHeight,
						outerOverflow: element.scrollHeight > element.clientHeight + 1,
					};
				});
				if (row.rows > 1 || row.outerOverflow)
					throw new Error(`配置のはみ出し: ${width}/${mode}/${id}`);
				const first = rows[0];
				if (
					first &&
					["header", "nav", "footer"].some((key) => first[key] !== row[key])
				)
					throw new Error(`固定位置の移動: ${width}/${mode}/${id}`);
				const reset = shell.getByRole("button", { name: "全て初期設定に戻す" });
				await reset.scrollIntoViewIfNeeded();
				const rect = await reset.boundingBox();
				if (!rect || rect.y < 0 || rect.y + rect.height > 900)
					throw new Error("初期化ボタンが画面外");
				rows.push(row);
			}
			results.push({ width, mode, rows });
		}
	}
	return results;
};
