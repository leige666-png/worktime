import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出模式，用于 GitHub Pages 部署
  output: "export",

  // GitHub Pages 部署路径（仓库名）
  basePath: "/worktime",

  // 图片优化在静态导出时需要关闭
  images: {
    unoptimized: true,
  },

  // 生产环境关闭 source map 减小体积
  productionBrowserSourceMaps: false,

  // 环境变量透传
  env: {
    NEXT_PUBLIC_GITHUB_TOKEN: process.env.NEXT_PUBLIC_GITHUB_TOKEN,
    NEXT_PUBLIC_REPO_OWNER: process.env.NEXT_PUBLIC_REPO_OWNER,
    NEXT_PUBLIC_REPO_NAME: process.env.NEXT_PUBLIC_REPO_NAME,
  },
};

export default nextConfig;
