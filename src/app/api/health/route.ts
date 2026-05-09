import { NextResponse } from 'next/server';

/**
 * 健康检查接口
 * Oceanus 网关和 HULK 容器平台用于探活
 * GET /api/health
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'worktime',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    { status: 200 }
  );
}
