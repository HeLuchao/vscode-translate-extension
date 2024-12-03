import fetch from 'node-fetch';
// import * as crypto from 'crypto-js';

export class BaiduTranslator {
    private appid: string;
    private secret: string;

    constructor(appid: string, secret: string) {
        this.appid = appid;
        this.secret = secret;
    }

    async translate(text: string, from: string = 'en', to: string = 'ara'): Promise<string> {
        const salt = Date.now();
        // const sign = crypto.MD5(this.appid + text + salt + this.secret).toString();

        const response = await fetch('https://fanyi-api.baidu.com/api/trans/vip/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                q: text,
                from,
                to,
                appid: this.appid,
                salt: salt.toString(),
                // sign
            })
        });

        const data = await response.json();
        if (data.error_code) {
            throw new Error(`翻译错误: ${data.error_msg}`);
        }

        return data.trans_result[0].dst;
    }
}