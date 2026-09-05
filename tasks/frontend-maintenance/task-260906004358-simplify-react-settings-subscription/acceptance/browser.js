async (page) => {
    const errors = [];
    const onConsole = message => { if (message.type() === 'error') errors.push(message.text()); };
    page.on('console', onConsole);
    await page.goto('http://127.0.0.1:5175/simple-vrm/');
    const title = page.locator('dialog input[type="text"]');
    await title.waitFor();
    await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').find(entry => /\/sincroAppController\.ts(?:\?|$)/.test(entry.name)).name;
        const { SincroAppController } = await import(url);
        const app = SincroAppController.getCurrent();
        app.applySettings({ enableTalk: false, enableCharacterGaze: false, enableInspector: false });
        const initial = app.settingsStore.getSnapshot();
        if (initial !== app.settingsStore.getSnapshot()) throw new Error('Unstable snapshot');
    });
    await title.fill('購読確認');
    const before = await title.inputValue();
    const beforeDisabled = await title.isDisabled();
    await page.getByRole('button', { name: '開始する', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog')?.open);
    await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').find(entry => /\/sincroAppController\.ts(?:\?|$)/.test(entry.name)).name;
        const { SincroAppController } = await import(url);
        SincroAppController.getCurrent().debug.showRightToolSettingsPanel();
    });
    const panelTitle = page.locator('#sincroReactSettingsPanelContainer input[type="text"]');
    await panelTitle.waitFor();
    if (await panelTitle.inputValue() !== before || await panelTitle.isDisabled() !== beforeDisabled) throw new Error('Before/after settings mismatch');
    await panelTitle.fill('起動後の変更');
    await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').find(entry => /\/sincroAppController\.ts(?:\?|$)/.test(entry.name)).name;
        const { SincroAppController } = await import(url);
        const app = SincroAppController.getCurrent();
        if (app.settingsStore.getSnapshot().settings.titleText !== '起動後の変更') throw new Error('Update missing');
        app.debug.hideRightToolSettingsPanel();
        app.dialog.open();
    });
    await title.waitFor();
    if (await title.inputValue() !== '起動後の変更') throw new Error('Dialog stale');
    if (errors.some(error => /Maximum update depth|cached|Invalid hook/.test(error))) throw new Error('React subscription error');
    page.off('console', onConsole);
    return { before, after: await title.inputValue(), titleDisabled: beforeDisabled, reactSubscriptionErrors: 0 };
}
