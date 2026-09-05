async (page) => {
    await page.goto('http://127.0.0.1:5175/simple-vrm/');
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => /\/talkManager\.ts(?:\?|$)/.test(entry.name)));
    await page.evaluate(async () => {
        const { TalkManager } = await import(performance.getEntriesByType('resource').find(entry => /\/talkManager\.ts(?:\?|$)/.test(entry.name)).name);
        TalkManager.getManager().addTelopChannelMessage({ speech_id: 9001, timestamp: 0, message: '確認', text: '取り付け前', vowel: 'a', length: 10, new_text: true });
        const { default: { createRoot } } = await import(performance.getEntriesByType('resource').find(entry => /\/react-dom_client\.js\?/.test(entry.name)).name);
        const { default: { createElement } } = await import(performance.getEntriesByType('resource').find(entry => /\/react\.js\?/.test(entry.name)).name);
        const { SincroTelopView } = await import('/features/conversation/telop/react/sincroTelopView.tsx');
        const host = document.createElement('div');
        host.id = 'telop-acceptance';
        document.body.append(host);
        createRoot(host).render(createElement(SincroTelopView));
    });
    const initial = page.locator('#telop-acceptance [data-speech-id="9001"]');
    await initial.waitFor();
    if (await initial.textContent() !== '取り付け前') throw new Error('Initial history missing');
    await page.evaluate(async () => {
        const { TalkManager } = await import(performance.getEntriesByType('resource').find(entry => /\/talkManager\.ts(?:\?|$)/.test(entry.name)).name);
        TalkManager.getManager().addTelopChannelMessage({ speech_id: 9001, timestamp: 0, message: '確認', text: '・追加', vowel: 'a', length: 10, new_text: true });
    });
    await page.waitForFunction(() => document.querySelector('#telop-acceptance span')?.textContent === '取り付け前・追加');
    const actual = page.locator('#sincroFooterBox [data-speech-id="9001"]');
    if (await actual.count() !== 1 || await actual.textContent() !== '取り付け前・追加') throw new Error('Duplicate or missing telop');
    return { initialAndUpdated: await initial.textContent(), footerCount: await actual.count() };
}
