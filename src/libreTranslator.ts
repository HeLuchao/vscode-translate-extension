import fetch from 'node-fetch';

export class LibreTranslator {
    private servers = [
        'https://translate.terraprint.co',
        'https://translate.fortytwo-it.com',
        'https://translate.api.skitzen.com',
        'https://translate.argosopentech.com'
    ];

    async translate(text: string, from: string = 'en', to: string = 'ar'): Promise<string> {
        let lastError: Error | null = null;

        // 尝试所有服务器
        for (const server of this.servers) {
            try {
                const response = await fetch(`${server}/translate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        q: text,
                        source: from,
                        target: to
                    }),
                    timeout: 5000 // 5秒超时
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(`翻译错误: ${data.error || '未知错误'}`);
                }

                return data.translatedText;
            } catch (error) {
                lastError = error as Error;
                console.log(`服务器 ${server} 失败，尝试下一个...`);
                continue;
            }
        }

        throw new Error(`所有翻译服务器都失败了: ${lastError?.message}`);
    }
}