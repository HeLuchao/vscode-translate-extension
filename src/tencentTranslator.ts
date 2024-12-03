import fetch from 'node-fetch';

export class TencentTranslator {
    private baseUrl = 'https://transmart.qq.com/api/imt';
    private clientKey = `browser-chrome-131.0.0-Mac_OS-${this.generateUUID()}-${Date.now()}`;

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async translate(text: string, from: string = 'en', to: string = 'ar'): Promise<string> {
        try {
            console.log(`正在翻译: ${text}`);
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Origin': 'https://transmart.qq.com',
                    'Referer': `https://transmart.qq.com/zh-CN/index?sourcelang=${from}&targetlang=${to}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    header: {
                        fn: "auto_translation",
                        session: "",
                        client_key: this.clientKey,
                        user: ""
                    },
                    type: "plain",
                    model_category: "normal",
                    text_domain: "general",
                    source: {
                        lang: from,
                        text_list: [text]
                    },
                    target: {
                        lang: to
                    }
                })
            });

            const data = await response.json() as any;
            console.log('翻译响应:', data);

            if (!response.ok || data.error || !data.auto_translation) {
                console.error('翻译失败，响应数据:', data);
                throw new Error(data.message || '翻译请求失败');
            }

            const result = data.auto_translation[0] || '';
            console.log(`翻译结果: ${result}`);
            return result;
        } catch (error) {
            console.error('翻译错误:', error);
            throw new Error(`翻译失败: ${(error as Error).message}`);
        }
    }
}