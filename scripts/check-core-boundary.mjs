#!/usr/bin/env node
/**
 * 静态边界检查（CI）：src/core 与 src/cli 不得依赖 DSH 运行时。
 * - src/core/**  禁止 import 任何 `@deepseek-ai/*`
 * - src/cli/**   禁止 import `../dsh/*`（CLI 只能消费 core）
 * 注释行里的说明文字（以 * 或 // 开头）不计。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const violations = [];

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (p.endsWith('.ts') || p.endsWith('.mjs')) out.push(p);
    }
    return out;
}

function scan(relDir, forbidden) {
    const dir = join(root, relDir);
    let files = [];
    try {
        files = walk(dir);
    }
    catch {
        return;
    }
    for (const file of files) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*'))
                return;
            if (/@deepseek-ai\//.test(line))
                violations.push(`${file.replace(root + '/', '').replace(/\\/g, '/')}:${i + 1} 禁止 import DSH 包: ${trimmed}`);
            for (const f of forbidden) {
                if (new RegExp(`from '${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(line))
                    violations.push(`${file.replace(root + '/', '').replace(/\\/g, '/')}:${i + 1} 禁止依赖 ${f}: ${trimmed}`);
            }
        });
    }
}

scan('src/core', []);
scan('src/cli', ['../dsh/', './dsh/']);

if (violations.length > 0) {
    console.error('core/cli 边界检查失败：');
    for (const v of violations) console.error('  ' + v);
    process.exit(1);
}
console.log('core/cli boundary ok：src/core 无 DSH 依赖，src/cli 只依赖 core');
