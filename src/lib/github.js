// ---------------------------------------------------------------------------
// Storage layer: the ledger lives as a single JSON file in a private GitHub
// repo, read and written through the Contents API. No backend of our own.
//
// Every save is a commit, so the repo doubles as free version history, and
// GitHub's required `sha` parameter gives us real conflict detection instead
// of silent last-write-wins.
// ---------------------------------------------------------------------------

const API = "https://api.github.com";

// btoa/atob are Latin-1 only. Category names and descriptions are Chinese, so
// the JSON must round-trip through UTF-8 bytes explicitly or it corrupts.
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToUtf8(b64) {
  // GitHub wraps its base64 payload at 60 chars, so strip whitespace first.
  const binary = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export class GitHubError extends Error {
  constructor(message, { status, kind } = {}) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.kind = kind; // 'auth' | 'notfound' | 'conflict' | 'network' | 'other'
  }
}

function describe(status, body) {
  const msg = (body && body.message) || "";
  if (status === 401) return new GitHubError("Token 无效或已过期，请到设置里重新填写。", { status, kind: "auth" });
  if (status === 403 && /rate limit/i.test(msg)) return new GitHubError("GitHub API 调用频率超限，请稍后再试。", { status, kind: "other" });
  if (status === 403) return new GitHubError("Token 权限不足。请确认它对该仓库有 Contents 读写权限。", { status, kind: "auth" });
  if (status === 404) return new GitHubError("找不到该仓库或路径。请检查设置里的仓库名和分支。", { status, kind: "notfound" });
  if (status === 409) return new GitHubError("版本冲突：远端已被其他设备修改。", { status, kind: "conflict" });
  if (status === 422) return new GitHubError(`GitHub 拒绝了这次写入：${msg || "请求内容不合法"}`, { status, kind: "conflict" });
  return new GitHubError(`GitHub 返回错误 ${status}${msg ? `：${msg}` : ""}`, { status, kind: "other" });
}

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new GitHubError("无法连接 GitHub，请检查网络。", { kind: "network" });
  }
  let body = null;
  const text = await res.text();
  if (text) { try { body = JSON.parse(text); } catch { body = null; } }
  if (!res.ok) throw describe(res.status, body);
  return body;
}

function contentsUrl(cfg) {
  const path = String(cfg.path || "ledger.json").replace(/^\/+/, "");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodedPath}`;
}

/**
 * Reads the ledger file.
 * Returns { state, sha } — or { state: null, sha: null } when the file does
 * not exist yet, which is the normal first-run case rather than an error.
 */
export async function loadLedger(cfg) {
  const branch = cfg.branch || "main";
  const url = `${contentsUrl(cfg)}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;
  let body;
  try {
    body = await request(url, { method: "GET", headers: headers(cfg.token), cache: "no-store" });
  } catch (e) {
    if (e.kind === "notfound") {
      // Distinguish "repo missing" from "file not created yet".
      await assertRepoReachable(cfg);
      return { state: null, sha: null, missing: true };
    }
    throw e;
  }
  if (Array.isArray(body)) {
    throw new GitHubError("设置里的路径指向一个目录，请填写具体的文件名，例如 ledger.json。", { kind: "other" });
  }
  let parsed;
  try {
    parsed = JSON.parse(base64ToUtf8(body.content || ""));
  } catch (e) {
    throw new GitHubError("远端文件不是合法的 JSON，无法读取。可以在 GitHub 上查看该文件的历史版本恢复。", { kind: "other" });
  }
  return { state: parsed, sha: body.sha, missing: false };
}

async function assertRepoReachable(cfg) {
  const url = `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  await request(url, { method: "GET", headers: headers(cfg.token) });
}

/**
 * Writes the ledger file. `sha` must be the sha from the last successful
 * load/save; omit it only when creating the file for the first time.
 * Throws a GitHubError with kind 'conflict' when the remote moved on.
 */
export async function saveLedger(cfg, state, sha, message) {
  const branch = cfg.branch || "main";
  const json = JSON.stringify(state, null, 2);
  const payload = {
    message: message || `ledger: update ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    content: utf8ToBase64(json),
    branch,
  };
  if (sha) payload.sha = sha;

  const body = await request(contentsUrl(cfg), {
    method: "PUT",
    headers: headers(cfg.token),
    body: JSON.stringify(payload),
  });
  return { sha: body.content.sha, commitUrl: body.commit && body.commit.html_url };
}

/** Cheap credentials/permissions check used by the settings screen. */
export async function verifyAccess(cfg) {
  const repo = await request(
    `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`,
    { method: "GET", headers: headers(cfg.token) }
  );
  if (!repo.permissions || !repo.permissions.push) {
    throw new GitHubError("这个 Token 只有读权限，无法保存。请授予 Contents 的读写权限。", { kind: "auth" });
  }
  return { fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch };
}

export function historyUrl(cfg) {
  const path = String(cfg.path || "ledger.json").replace(/^\/+/, "");
  return `https://github.com/${cfg.owner}/${cfg.repo}/commits/${cfg.branch || "main"}/${path}`;
}
