/**
 * Nest Serverless 入口文件
 * 将 Next.js 应用适配为 Nest 云函数
 */
const adapter = require('@fdfe/ecf-http-adapter');
const next = require('next');

const app = next({ dev: false });
const handle = app.getRequestHandler();

let prepared = false;

module.exports.main = async (event, context) => {
  if (!prepared) {
    await app.prepare();
    prepared = true;
  }

  // 创建一个简单的 Koa-like app 来处理请求
  const server = {
    callback() {
      return (req, res) => {
        handle(req, res);
      };
    },
  };

  return adapter(server)(event, context);
};

// 初始化函数，服务启动时执行
module.exports.initialize = async (context) => {
  await app.prepare();
  prepared = true;
  console.log('[Worktime] Next.js app prepared successfully');
};
