import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Agent 核心使用 node:fs，必须在 Node.js runtime 执行
  serverExternalPackages: ['node-cron'],
  // 避免 monorepo 上级 lockfile 干扰产物追踪
  outputFileTracingRoot: path.join(__dirname),
  // src/ 使用 ESM .js 扩展名导入，映射回 .ts
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
