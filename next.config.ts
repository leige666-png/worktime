import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 standalone 输出模式，生成独立可部署的产物
  output: "standalone",

  // 生产环境关闭 source map 减小体积
  productionBrowserSourceMaps: false,

  // 环境变量透传
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
