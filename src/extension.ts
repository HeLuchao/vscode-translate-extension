import * as vscode from 'vscode';
import { TencentTranslator } from './tencentTranslator';
import * as fs from 'fs';
import * as path from 'path';

interface TranslationMap {
    [key: string]: string;
}

interface NestedTranslationMap {
    [key: string]: string | NestedTranslationMap;
}

function formatEnglishText(key: string): string {
    // 获取最后一个点后的部分
    const lastPart = key.split('.').pop() || '';

    // 将驼峰命名转换为空格分隔的单词
    const words = lastPart.replace(/([A-Z])/g, ' $1')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/[._-\s]+/)
        .filter(word => word.length > 0);

    // 将每个单词首字母大写
    return words.map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

function setNestedValue(obj: NestedTranslationMap, path: string[], value: string) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!(key in current)) {
            current[key] = {};
        }
        current = current[key] as NestedTranslationMap;
    }
    current[path[path.length - 1]] = value;
}

function mergeTranslations(existing: NestedTranslationMap, newTranslations: NestedTranslationMap): NestedTranslationMap {
    const merged = JSON.parse(JSON.stringify(existing)); // 深拷贝现有翻译

    function deepMerge(target: NestedTranslationMap, source: NestedTranslationMap) {
        for (const [key, value] of Object.entries(source)) {
            if (typeof value === 'object' && value !== null) {
                // 如果是对象，递归合并
                if (!(key in target) || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                deepMerge(target[key] as NestedTranslationMap, value as NestedTranslationMap);
            } else {
                // 如果目标位置已经有值，则保留原值
                if (!(key in target)) {
                    target[key] = value;
                }
            }
        }
    }

    deepMerge(merged, newTranslations);
    return merged;
}

function getNestedValue(obj: NestedTranslationMap, path: string[]): string {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!(key in current)) {
            return '';
        }
        current = current[key] as NestedTranslationMap;
    }
    const value = current[path[path.length - 1]];
    return typeof value === 'string' ? value : '';
}

async function readTranslationFile(filePath: string): Promise<NestedTranslationMap> {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    try {
        // 处理 export default 格式
        if (content.trim().startsWith('export default')) {
            // 移除 export default 并解析对象内容
            const objectContent = content
                .replace(/export\s+default\s*/, '')
                .replace(/;?\s*$/, ''); // 移除末尾的分号
            // 使用 Function 构造器安全地解析对象
            const obj = new Function(`return ${objectContent}`)();
            return obj;
        }
        // 尝试作为普通 JSON 解析
        return JSON.parse(content);
    } catch (parseError: any) {
        console.warn(`解析文件失败: ${parseError.message}`);
        return {};
    }
}

async function writeTranslationFile(filePath: string, translations: NestedTranslationMap): Promise<void> {
    // 生成 export default 格式的内容
    const content = `export default ${JSON.stringify(translations, null, 2)};`;
    await fs.promises.writeFile(filePath, content, 'utf-8');
}

// 添加延时函数
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 添加重试函数
async function retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(`操作失败，第 ${i + 1} 次重试`, error);
            if (i < retries - 1) {
                await delay(delayMs * (i + 1)); // 递增延迟时间
            }
        }
    }
    throw lastError;
}

function normalizePath(inputPath: string, currentFileDir: string): string {
    // 移除开头的 './' 或 '/'
    const cleanPath = inputPath.replace(/^\.\/|^\//, '');

    // 如果输入路径以 packages/ 开头，从工作区根目录开始解析
    if (cleanPath.startsWith('packages/')) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (workspaceRoot) {
            return path.join(workspaceRoot, cleanPath);
        }
    }

    // 否则从当前文件目录解析
    return path.join(currentFileDir, cleanPath);
}

export function activate(context: vscode.ExtensionContext) {
    const translator = new TencentTranslator();

    const outputChannel = vscode.window.createOutputChannel("English to Arabic Translator");

    let translateCommand = vscode.commands.registerCommand('english-to-arabic.translate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的编辑器！');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showErrorMessage('请先选择要翻译的文本！');
            return;
        }

        try {
            // 显示加载提示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在翻译...",
                cancellable: false
            }, async () => {
                const result = await translator.translate(text);
                if (result && result !== text) {  // 确保翻译结果不为空且不等于原文
                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, result);
                    });
                } else {
                    throw new Error('翻译结果无效');
                }
            });
        } catch (error: any) {
            console.error('翻译错误:', error);
            vscode.window.showErrorMessage('翻译失败：' + error.message);
        }
    });

    let translateFileCommand = vscode.commands.registerCommand('english-to-arabic.translateFile', async (uri: vscode.Uri) => {
        try {
            // 确保有有效的 URI
            if (!uri || !uri.fsPath) {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    throw new Error('请在文件资源管理器中右键点击文件，或确保有打开的编辑器');
                }
                uri = activeEditor.document.uri;
            }

            // 确保工作区
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                throw new Error('请在工作区中使用此功能');
            }

            const currentFileDir = path.dirname(uri.fsPath);

            const enOutputPath = await vscode.window.showInputBox({
                prompt: '请输入英文翻译文件的输出路径（相对于当前文件或工作区）',
                placeHolder: '例如: ./locales/en.js 或 packages/admin/src/locales/en/index.js',
                value: './locales/en.js'
            });

            if (!enOutputPath) {
                return;
            }

            const arOutputPath = await vscode.window.showInputBox({
                prompt: '请输入阿拉伯语翻译文件的输出路径（相对于当前文件或工作区）',
                placeHolder: '例如: ./locales/ar.js 或 packages/admin/src/locales/ar/index.js',
                value: './locales/ar.js'
            });

            if (!arOutputPath) {
                return;
            }

            const enFullPath = normalizePath(enOutputPath, currentFileDir);
            const arFullPath = normalizePath(arOutputPath, currentFileDir);

            let existingEnTranslations: NestedTranslationMap = {};
            let existingArTranslations: NestedTranslationMap = {};

            try {
                existingEnTranslations = await readTranslationFile(enFullPath);
                console.log('成功读取英文翻译文件');

                existingArTranslations = await readTranslationFile(arFullPath);
                console.log('成功读取阿拉伯语翻译文件');
            } catch (error: any) {
                console.warn(`读取现有翻译文件失败: ${error.message}`);
            }

            const fileContent = await fs.promises.readFile(uri.fsPath, 'utf-8');
            const regex = /\$t\(['"](.+?)['"]\)/g;
            let match;
            const newEnTranslations: NestedTranslationMap = {};
            const newArTranslations: NestedTranslationMap = {};
            const translationKeys: string[] = [];

            while ((match = regex.exec(fileContent)) !== null) {
                const key = match[1];
                translationKeys.push(key);
                const path = key.split('.');
                const englishText = formatEnglishText(key);

                // 检查是否已存在英文翻译
                const existingEnTranslation = getNestedValue(existingEnTranslations, path);
                if (!existingEnTranslation) {
                    // 只在不存在时才设置新的英文翻译
                    setNestedValue(newEnTranslations, path, englishText);
                }
            }

            // 合并翻译，保留现有内容
            const mergedEnTranslations = mergeTranslations(existingEnTranslations, newEnTranslations);
            const mergedArTranslations = mergeTranslations(existingArTranslations, newArTranslations);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在翻译...",
                cancellable: true
            }, async (progress, token) => {
                const total = translationKeys.length;
                let current = 0;
                const batchSize = 3; // 减小批次大小
                const maxRetries = 5; // 增加重试次数
                const initialDelay = 500; // 初始延迟时间

                for (let i = 0; i < translationKeys.length; i += batchSize) {
                    if (token.isCancellationRequested) {
                        throw new Error('用户取消了翻译');
                    }

                    const batch = translationKeys.slice(i, i + batchSize);
                    const promises = batch.map(async (key) => {
                        const path = key.split('.');
                        const englishText = getNestedValue(mergedEnTranslations, path);

                        if (!englishText) {
                            return;
                        }

                        const existingArTranslation = getNestedValue(mergedArTranslations, path);
                        if (existingArTranslation) {
                            progress.report({
                                increment: (100 / total),
                                message: `(${++current}/${total}) ${key} (已存在)`
                            });
                            return;
                        }

                        try {
                            const result = await retryOperation(
                                async () => {
                                    const translation = await translator.translate(englishText);
                                    if (!translation || translation === englishText) {
                                        throw new Error('翻译结果无效');
                                    }
                                    return translation;
                                },
                                maxRetries,
                                initialDelay
                            );

                            setNestedValue(mergedArTranslations, path, result);
                            progress.report({
                                increment: (100 / total),
                                message: `(${++current}/${total}) ${key} -> ${result}`
                            });
                        } catch (error) {
                            console.error(`翻译失败，使用英文原文: ${key}`, error);
                            setNestedValue(mergedArTranslations, path, englishText);
                            vscode.window.showWarningMessage(
                                `翻译失败（${key}），已保留英文原文: ${englishText}`
                            );
                        }
                    });

                    try {
                        await Promise.all(promises);
                    } catch (error) {
                        console.error('批次处理失败:', error);
                    }

                    // 增加批次间的延迟
                    if (i + batchSize < translationKeys.length) {
                        await delay(1000); // 增加到1秒
                    }
                }

                // 确保目录存在
                await ensureDirectoryExists(path.dirname(enFullPath));
                await ensureDirectoryExists(path.dirname(arFullPath));

                await writeTranslationFile(enFullPath, mergedEnTranslations);
                await writeTranslationFile(arFullPath, mergedArTranslations);
            });

            const newKeysCount = translationKeys.length;
            const existingKeysCount = Object.keys(existingEnTranslations).length;

            vscode.window.showInformationMessage(
                `翻译完成！\n` +
                `新增翻译：${newKeysCount} 条\n` +
                `现有翻译：${existingKeysCount} 条\n` +
                `总计：${Object.keys(mergedEnTranslations).length} 条\n` +
                `英文文件：${enFullPath}\n` +
                `阿拉伯语文件：${arFullPath}`
            );
        } catch (error: any) {
            if (error.message === '用户取消了翻译') {
                vscode.window.showInformationMessage('翻译已取消');
            } else {
                vscode.window.showErrorMessage('翻译失败：' + error.message);
            }
        }
    });

    // 添加新的翻译为英语的命令
    let translateToEnglishCommand = vscode.commands.registerCommand('english-to-arabic.translateToEnglish', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的编辑器！');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showErrorMessage('请先选择要翻译的文本！');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在翻译...",
                cancellable: false
            }, async () => {
                // 这里将目标语言改为英语
                const result = await translator.translate(text, 'auto', 'en');
                if (result && result !== text) {
                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, result);
                    });
                } else {
                    throw new Error('翻译结果无效');
                }
            });
        } catch (error: any) {
            console.error('翻译错误:', error);
            vscode.window.showErrorMessage('翻译失败：' + error.message);
        }
    });

    // 将新命令添加到订阅列表
    context.subscriptions.push(translateCommand, translateFileCommand, translateToEnglishCommand);
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

export function deactivate() {}