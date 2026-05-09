import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import AuthProvider from '@/components/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '工时管理系统 - WorkTime',
  description: '多用户实时工时管理系统，支持加班申报、工损记录、多维度统计分析',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <AuthProvider>{children}</AuthProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
