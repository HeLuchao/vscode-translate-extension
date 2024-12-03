import fetch from 'node-fetch';
import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class TencentTranslator {
    private endpoint = 'tmt.tencentcloudapi.com';
    private region = 'ap-guangzhou';
    private service = 'tmt';
    private version = '2018-03-21';
    private secretId: string;
    private secretKey: string;

    constructor() {
        const config = vscode.workspace.getConfiguration('english-to-arabic');
        this.secretId = config.get('secretId') || '';
        this.secretKey = config.get('secretKey') || '';
        
        if (!this.secretId || !this.secretKey) {
            throw new Error('Please configure Tencent Cloud API credentials in VSCode settings');
        }
    }

    private sha256(message: string, secret = ''): string {
        return crypto.createHmac('sha256', secret).update(message).digest('hex');
    }

    private getHash(message: string): string {
        return crypto.createHash('sha256').update(message).digest('hex');
    }

    private getDate(timestamp: number) {
        const date = new Date(timestamp * 1000);
        return date.toISOString().split('T')[0];
    }

    async translate(text: string, from: string = 'en', to: string = 'ar'): Promise<string> {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const date = this.getDate(timestamp);

            const payload = {
                SourceText: text,
                Source: from,
                Target: to,
                ProjectId: 0
            };

            const hashedRequestPayload = this.getHash(JSON.stringify(payload));
            
            const canonicalRequest = [
                'POST',
                '/',
                '',
                'content-type:application/json\nhost:' + this.endpoint + '\n',
                'content-type;host',
                hashedRequestPayload
            ].join('\n');

            const stringToSign = [
                'TC3-HMAC-SHA256',
                timestamp,
                `${date}/${this.service}/tc3_request`,
                this.getHash(canonicalRequest)
            ].join('\n');

            const secretDate = this.sha256(date, 'TC3' + this.secretKey);
            const secretService = this.sha256(this.service, secretDate);
            const secretSigning = this.sha256('tc3_request', secretService);
            const signature = this.sha256(stringToSign, secretSigning);

            const authorization = `TC3-HMAC-SHA256 Credential=${this.secretId}/${date}/${this.service}/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`;

            const response = await fetch(`https://${this.endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Host': this.endpoint,
                    'X-TC-Action': 'TextTranslate',
                    'X-TC-Version': this.version,
                    'X-TC-Timestamp': timestamp.toString(),
                    'X-TC-Region': this.region,
                    'Authorization': authorization
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json() as any;
            
            if (data.Response && data.Response.Error) {
                throw new Error(data.Response.Error.Message);
            }

            return data.Response.TargetText;
        } catch (error) {
            console.error('Translation error:', error);
            throw error;
        }
    }
}