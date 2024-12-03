declare module 'translate-google-api' {
    function translate(text: string | string[], options?: {
        tld?: string;
        to?: string;
        from?: string;
    }): Promise<string[]>;
    export default translate;
}