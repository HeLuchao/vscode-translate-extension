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
    const merged = { ...existing };
    for (const [key, value] of Object.entries(newTranslations)) {
        if (typeof value === 'object' && value !== null) {
            merged[key] = mergeTranslations(
                (existing[key] as NestedTranslationMap) || {},
                value as NestedTranslationMap
            );
        } else {
            merged[key] = value;
        }
    }
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

export function activate(context: vscode.ExtensionContext) {
    console.log('扩展 "english-to-arabic" 开始激活');

    try {
        const translator = new TencentTranslator();
        console.log('TencentTranslator 初始化成功');

        const outputChannel = vscode.window.createOutputChannel("English to Arabic Translator");

        // 注册命令前打印日志
        console.log('开始注册命令: english-to-arabic.translate');
        let translateCommand = vscode.commands.registerCommand('english-to-arabic.translate', async () => {
            console.log('执行翻译命令');
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
        console.log('translate 命令注册成功');

        console.log('开始注册命令: english-to-arabic.translateFile');
        let translateFileCommand = vscode.commands.registerCommand('english-to-arabic.translateFile', async (uri: vscode.Uri) => {
            console.log('执行文件翻译命令');
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
                    prompt: '请输入英文翻译文件的输出路径（相对于当前文件）',
                    placeHolder: '例如: ./locales/en.json',
                    value: './locales/en.json'
                });

                if (!enOutputPath) {
                    return;
                }

                const arOutputPath = await vscode.window.showInputBox({
                    prompt: '请输入阿拉伯语翻译文件的输出路径（相对于当前文件）',
                    placeHolder: '例如: ./locales/ar.json',
                    value: './locales/ar.json'
                });

                if (!arOutputPath) {
                    return;
                }

                const enFullPath = path.isAbsolute(enOutputPath) ? enOutputPath : path.join(currentFileDir, enOutputPath);
                const arFullPath = path.isAbsolute(arOutputPath) ? arOutputPath : path.join(currentFileDir, arOutputPath);

                let existingEnTranslations: NestedTranslationMap = {};
                let existingArTranslations: NestedTranslationMap = {};

                try {
                    if (fs.existsSync(enFullPath)) {
                        const enContent = await fs.promises.readFile(enFullPath, 'utf-8');
                        existingEnTranslations = JSON.parse(enContent);
                    }
                    if (fs.existsSync(arFullPath)) {
                        const arContent = await fs.promises.readFile(arFullPath, 'utf-8');
                        existingArTranslations = JSON.parse(arContent);
                    }
                } catch (error: any) {
                    vscode.window.showWarningMessage(`读取现有翻译文件失败，将创建新文件：${error.message}`);
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
                    setNestedValue(newEnTranslations, path, englishText);
                }

                const mergedEnTranslations = mergeTranslations(existingEnTranslations, newEnTranslations);
                const mergedArTranslations = mergeTranslations(existingArTranslations, {});

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "正在翻译...",
                    cancellable: false
                }, async (progress) => {
                    const total = translationKeys.length;
                    let current = 0;

                    for (const key of translationKeys) {
                        const path = key.split('.');
                        const englishText = getNestedValue(mergedEnTranslations, path);

                        if (!englishText) {
                            console.log(`跳过空文案: ${key}`);
                            continue;
                        }

                        // 检查是否已存在阿拉伯语翻译
                        let currentArObj = mergedArTranslations;
                        let exists = true;
                        for (const part of path) {
                            if (!(part in currentArObj)) {
                                exists = false;
                                break;
                            }
                            currentArObj = currentArObj[part] as NestedTranslationMap;
                        }

                        if (!exists) {
                            progress.report({
                                increment: (100 / total),
                                message: `(${++current}/${total}) ${key} -> ${englishText}`
                            });
                            try {
                                const result = await translator.translate(englishText);
                                if (result && result !== englishText) {  // 确保翻译结果不为空且不等于原文
                                    setNestedValue(mergedArTranslations, path, result);
                                } else {
                                    console.error(`翻译结果无效: ${key} -> ${result}`);
                                }
                            } catch (error) {
                                console.error(`翻译失败: ${key}`, error);
                            }
                        } else {
                            progress.report({
                                increment: (100 / total),
                                message: `(${++current}/${total}) ${key} (已存在)`
                            });
                        }
                    }

                    await ensureDirectoryExists(path.dirname(enFullPath));
                    await ensureDirectoryExists(path.dirname(arFullPath));

                    await fs.promises.writeFile(
                        enFullPath,
                        JSON.stringify(mergedEnTranslations, null, 2),
                        'utf-8'
                    );
                    await fs.promises.writeFile(
                        arFullPath,
                        JSON.stringify(mergedArTranslations, null, 2),
                        'utf-8'
                    );
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
                vscode.window.showErrorMessage('翻译失败：' + error.message);
            }
        });
        console.log('translateFile 命令注册成功');

        context.subscriptions.push(translateCommand, translateFileCommand);
        console.log('命令注册完成，已添加到 subscriptions');
    } catch (error) {
        console.error('扩展激活过程中发生错误:', error);
    }
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