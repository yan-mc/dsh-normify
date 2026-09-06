#!/bin/bash
# dsh-normify build: compile src/ → lib/ with tsc.
# 两条路径（自动选择）：
#   1) 本地开发：vendor-ts/ 存在（预拷贝的工具链副本）→ 零网络直接编译；
#   2) 通用/CI：vendor-ts 不存在 → npm install（devDependencies 已含全部编译依赖）→ npx tsc。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Building dsh-normify ==="

if [ -d "vendor-ts/typescript/bin" ]; then
  echo "--- vendor-ts 路径（本地预置工具链） ---"
  mkdir -p node_modules/@deepseek-ai node_modules/@types
  rm -rf node_modules/typescript node_modules/@types/node node_modules/@deepseek-ai/cordis node_modules/@deepseek-ai/schemastery node_modules/@deepseek-ai/cosmokit node_modules/yaml
  cp -r vendor-ts/typescript node_modules/typescript
  cp -r vendor-ts/types-node node_modules/@types/node
  cp -r vendor-ts/cordis node_modules/@deepseek-ai/cordis
  cp -r vendor-ts/schemastery node_modules/@deepseek-ai/schemastery
  cp -r vendor-ts/cosmokit node_modules/@deepseek-ai/cosmokit
  cp -r vendor-ts/yaml node_modules/yaml
  node node_modules/typescript/bin/tsc -p tsconfig.json
else
  echo "--- npm 路径（CI / 通用环境） ---"
  if ! command -v npm >/dev/null 2>&1; then
    echo "build: 缺少 vendor-ts 且 npm 不在 PATH，无法构建。" >&2
    echo "build: 本地开发可先安装 Node.js（>=18），或运行 scripts/setup-vendor.ps1 从 DSH checkout 拷贝工具链。" >&2
    exit 1
  fi
  npm install --no-audit --no-fund
  npx tsc -p tsconfig.json
fi

echo "=== Build complete ==="
