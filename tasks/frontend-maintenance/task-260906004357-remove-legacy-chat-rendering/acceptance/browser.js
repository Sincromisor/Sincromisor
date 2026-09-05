async (page) => {
    await page.evaluate(async () => {
        const { ChatMessageService } = await import('/features/conversation/chat/model/chatMessageService.ts');
        const service = ChatMessageService.getService();
        service.writeSystemMessage('こんにちは、チャット確認');
        service.setSystemIcon('/images/icon-user.webp');
    });
    const greeting = page.locator('.sincroSystemMessage').filter({ hasText: 'こんにちは、チャット確認' });
    await greeting.waitFor();
    if (await greeting.count() !== 1) throw new Error('Duplicate greeting');
    if (await greeting.locator('img').getAttribute('src') !== '/images/icon-user.webp') throw new Error('Icon not updated');
    return { greeting: await greeting.innerText(), icon: await greeting.locator('img').getAttribute('src') };
}
