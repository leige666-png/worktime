/**
 * GitHub API 远程存储层
 * 
 * 将数据以 JSON 文件形式存储在 GitHub 仓库的 data 分支中。
 * 所有用户共享同一份数据，实现多人协作。
 * 
 * 存储结构（data 分支）：
 *   db/users.json
 *   db/groups.json
 *   db/overtime-types.json
 *   db/workloss-types.json
 *   db/overtime-records.json
 *   db/workloss-records.json
 *   db/notifications.json
 *   db/permission-requests.json
 *   db/tasks.json
 *   db/config.json
 */

const GITHUB_TOKEN = process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
const REPO_OWNER = process.env.NEXT_PUBLIC_REPO_OWNER || 'leige666-png';
const REPO_NAME = process.env.NEXT_PUBLIC_REPO_NAME || 'worktime';
const DATA_BRANCH = 'data';
const BASE_PATH = 'db';

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${BASE_PATH}`;

// SHA 缓存，用于更新文件时提供正确的 sha
const shaCache = new Map<string, string>();

// 内存缓存 + 时间戳
const memoryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5000; // 5秒缓存有效期

/**
 * 从 GitHub 读取 JSON 文件
 */
export async function readFile<T>(filename: string): Promise<T[]> {
  // 检查内存缓存
  const cached = memoryCache.get(filename);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T[];
  }

  try {
    const response = await fetch(`${API_BASE}/${filename}?ref=${DATA_BRANCH}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      cache: 'no-store',
    });

    if (response.status === 404) {
      // 文件不存在，返回空数组
      return [];
    }

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status} ${response.statusText}`);
      // 降级到本地缓存
      return (cached?.data as T[]) || [];
    }

    const json = await response.json();
    shaCache.set(filename, json.sha);

    // 解码 base64 内容
    const content = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
    const data = JSON.parse(content) as T[];

    // 更新内存缓存
    memoryCache.set(filename, { data, timestamp: Date.now() });

    return data;
  } catch (error) {
    console.error(`Failed to read ${filename}:`, error);
    return (cached?.data as T[]) || [];
  }
}

/**
 * 写入 JSON 文件到 GitHub
 */
export async function writeFile<T>(filename: string, data: T[]): Promise<boolean> {
  // 立即更新内存缓存
  memoryCache.set(filename, { data, timestamp: Date.now() });

  try {
    // 先获取当前文件的 sha（如果缓存中没有）
    let sha = shaCache.get(filename);
    if (!sha) {
      const checkResponse = await fetch(`${API_BASE}/${filename}?ref=${DATA_BRANCH}`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      if (checkResponse.ok) {
        const checkJson = await checkResponse.json();
        sha = checkJson.sha;
      }
    }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    const body: Record<string, unknown> = {
      message: `update ${filename}`,
      content,
      branch: DATA_BRANCH,
    };
    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(`${API_BASE}/${filename}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to write ${filename}: ${response.status}`, errorText);

      // 如果是 sha 冲突（409），重试一次
      if (response.status === 409 || response.status === 422) {
        shaCache.delete(filename);
        return retryWrite(filename, data);
      }
      return false;
    }

    const result = await response.json();
    shaCache.set(filename, result.content.sha);
    return true;
  } catch (error) {
    console.error(`Failed to write ${filename}:`, error);
    return false;
  }
}

/**
 * 冲突重试写入
 */
async function retryWrite<T>(filename: string, data: T[]): Promise<boolean> {
  try {
    const checkResponse = await fetch(`${API_BASE}/${filename}?ref=${DATA_BRANCH}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    let sha: string | undefined;
    if (checkResponse.ok) {
      const checkJson = await checkResponse.json();
      sha = checkJson.sha;
    }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body: Record<string, unknown> = {
      message: `update ${filename} (retry)`,
      content,
      branch: DATA_BRANCH,
    };
    if (sha) body.sha = sha;

    const response = await fetch(`${API_BASE}/${filename}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const result = await response.json();
      shaCache.set(filename, result.content.sha);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 确保 data 分支存在
 */
export async function ensureDataBranch(): Promise<void> {
  try {
    // 检查 data 分支是否存在
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/branches/${DATA_BRANCH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      // 获取 main 分支的 sha
      const mainResponse = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/main`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );
      const mainData = await mainResponse.json();
      const mainSha = mainData.object.sha;

      // 创建 data 分支
      await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`,
        {
          method: 'POST',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: `refs/heads/${DATA_BRANCH}`,
            sha: mainSha,
          }),
        }
      );
    }
  } catch (error) {
    console.error('Failed to ensure data branch:', error);
  }
}

/**
 * 清除指定文件的缓存，强制下次从远程读取
 */
export function invalidateCache(filename: string): void {
  memoryCache.delete(filename);
}

/**
 * 清除所有缓存
 */
export function invalidateAllCache(): void {
  memoryCache.clear();
}
