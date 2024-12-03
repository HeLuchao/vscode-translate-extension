import fetch from 'node-fetch';

export class GoogleTranslator {
    private async fetchWithRetry(url: string, retries = 3, timeout = 10000): Promise<Response> {
        for (let i = 0; i < retries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response:any = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 递增延迟
            }
        }
        throw new Error('所有重试都失败了');
    }

    async translate(text: string, from: string = 'en', to: string = 'ar'): Promise<string> {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;

            const response = await this.fetchWithRetry(url);
            const data:any = await response.json();

            if (!response.ok) {
                throw new Error('翻译请求失败');
            }

            return data[0].map((item: any[]) => item[0]).join('');
        } catch (error) {
            throw new Error(`翻译失败: ${(error as Error).message}`);
        }
    }
}