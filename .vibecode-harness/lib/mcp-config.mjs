import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const MCP_SERVER_NAME = "vibecode-checker";
export const REQUIRED_MCP_TOOLS = Object.freeze(["scan_code", "scan_path", "server_status"]);

const CODEX_BEGIN = "# BEGIN vibecode-harness managed MCP: vibecode-checker";
const CODEX_END = "# END vibecode-harness managed MCP: vibecode-checker";

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function entryDigest(entry) {
  return digest(JSON.stringify(entry));
}

function parseJsonDocument(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function codexBlock(server) {
  const args = `[${(server.args || []).map(tomlString).join(", ")}]`;
  return [
    CODEX_BEGIN,
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = ${tomlString(server.command)}`,
    `args = ${args}`,
    "required = true",
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 120",
    "default_tools_approval_mode = \"prompt\"",
    "env = { PYTHONUTF8 = \"1\", PYTHONIOENCODING = \"utf-8\" }",
    CODEX_END
  ].join("\n");
}

export function checkerMcpEntry(server) {
  return {
    type: "stdio",
    command: server.command,
    args: [...(server.args || [])],
    env: { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }
  };
}

async function writeWithBackup(path, content, backupDir, label) {
  await mkdir(dirname(path), { recursive: true });
  await mkdir(backupDir, { recursive: true });
  let backup = null;
  let beforeSha256 = null;
  if (await exists(path)) {
    const before = await readFile(path);
    beforeSha256 = digest(before);
    backup = join(backupDir, `${label}-${Date.now()}-${basename(path)}`);
    await copyFile(path, backup);
  }
  const temporary = `${path}.vibecode-writing-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
  return {
    backup,
    before_sha256: beforeSha256,
    after_sha256: digest(Buffer.from(content))
  };
}

function managedCodexPattern() {
  const escapedBegin = CODEX_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = CODEX_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escapedBegin}\\r?\\n[\\s\\S]*?\\r?\\n${escapedEnd}`, "g");
}

function sectionOutsideManagedBlock(content) {
  const withoutManaged = content.replace(managedCodexPattern(), "");
  return /^\s*\[mcp_servers\.vibecode-checker\]\s*$/m.test(withoutManaged);
}

export async function ensureCodexMcp({ configPath, server, backupDir, dryRun = false }) {
  const current = (await exists(configPath)) ? await readFile(configPath, "utf8") : "";
  const pattern = managedCodexPattern();
  const managedBlocks = current.match(pattern) || [];
  if (managedBlocks.length > 1 || sectionOutsideManagedBlock(current)) {
    return {
      status: "blocked",
      reason: "existing_mcp_configuration",
      location: configPath,
      message: "기존 Codex vibecode-checker MCP 설정이 있어 자동으로 덮어쓰지 않았습니다."
    };
  }
  const block = codexBlock(server);
  if (managedBlocks.length === 1 && managedBlocks[0].replaceAll("\r\n", "\n") === block) {
    return { status: "already_configured", location: configPath, managed_sha256: digest(block) };
  }
  const next = managedBlocks.length === 1
    ? current.replace(pattern, block)
    : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;
  if (dryRun) {
    return { status: managedBlocks.length ? "would_update" : "would_configure", location: configPath, managed_sha256: digest(block) };
  }
  const written = await writeWithBackup(configPath, next, backupDir, "codex-config");
  return { status: managedBlocks.length ? "updated" : "configured", location: configPath, managed_sha256: digest(block), ...written };
}

export async function removeManagedCodexMcp({ configPath, managedSha256, backupDir }) {
  if (!(await exists(configPath))) return { status: "not_present", location: configPath };
  const current = await readFile(configPath, "utf8");
  const pattern = managedCodexPattern();
  const matches = current.match(pattern) || [];
  if (matches.length !== 1) return { status: matches.length ? "manual_review_required" : "not_managed", location: configPath };
  if (managedSha256 && digest(matches[0].replaceAll("\r\n", "\n")) !== managedSha256) {
    return { status: "manual_review_required", reason: "managed_entry_changed", location: configPath };
  }
  const next = current.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  const written = await writeWithBackup(configPath, next, backupDir, "codex-config-before-remove");
  return { status: "removed", location: configPath, ...written };
}

export async function ensureJsonMcp({ configPath, server, backupDir, label, dryRun = false }) {
  let config = {};
  if (await exists(configPath)) {
    const text = await readFile(configPath, "utf8");
    if (text.trim()) {
      try { config = parseJsonDocument(text); }
      catch {
        return { status: "blocked", reason: "invalid_configuration", location: configPath, message: `기존 ${label} MCP 설정의 JSON 형식이 올바르지 않습니다.` };
      }
    }
  }
  if (!config || Array.isArray(config) || typeof config !== "object") {
    return { status: "blocked", reason: "invalid_configuration", location: configPath, message: `기존 ${label} MCP 설정 구조가 올바르지 않습니다.` };
  }
  if (config.mcpServers !== undefined && (!config.mcpServers || Array.isArray(config.mcpServers) || typeof config.mcpServers !== "object")) {
    return { status: "blocked", reason: "invalid_mcp_servers", location: configPath, message: `기존 ${label} mcpServers 구조가 올바르지 않습니다.` };
  }
  config.mcpServers ||= {};
  const entry = checkerMcpEntry(server);
  const existing = config.mcpServers[MCP_SERVER_NAME];
  if (existing && entryDigest(existing) !== entryDigest(entry)) {
    return { status: "blocked", reason: "existing_mcp_configuration", location: configPath, message: `기존 ${label} vibecode-checker MCP 설정이 있어 자동으로 덮어쓰지 않았습니다.` };
  }
  if (existing) return { status: "already_configured", location: configPath, managed: false };
  config.mcpServers[MCP_SERVER_NAME] = entry;
  if (dryRun) return { status: "would_configure", location: configPath, managed_sha256: entryDigest(entry) };
  const content = `${JSON.stringify(config, null, 2)}\n`;
  const written = await writeWithBackup(configPath, content, backupDir, `${label.toLowerCase().replaceAll(" ", "-")}-config`);
  return { status: "configured", location: configPath, managed_sha256: entryDigest(entry), ...written };
}

export async function removeManagedJsonMcp({ configPath, managedSha256, backupDir, label }) {
  if (!(await exists(configPath))) return { status: "not_present", location: configPath };
  let config;
  try { config = parseJsonDocument(await readFile(configPath, "utf8")); }
  catch { return { status: "manual_review_required", reason: "invalid_configuration", location: configPath }; }
  const existing = config?.mcpServers?.[MCP_SERVER_NAME];
  if (!existing) return { status: "not_present", location: configPath };
  if (!managedSha256 || entryDigest(existing) !== managedSha256) {
    return { status: "manual_review_required", reason: "managed_entry_changed", location: configPath };
  }
  delete config.mcpServers[MCP_SERVER_NAME];
  const content = `${JSON.stringify(config, null, 2)}\n`;
  const written = await writeWithBackup(configPath, content, backupDir, `${label.toLowerCase().replaceAll(" ", "-")}-before-remove`);
  return { status: "removed", location: configPath, ...written };
}

function parseJsonLines(buffer) {
  const messages = [];
  for (const line of buffer.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { messages.push(JSON.parse(line)); } catch { /* stderr and partial output are handled by timeout/result checks. */ }
  }
  return messages;
}

export function testMcpServer(server, { timeoutMs = 30000 } = {}) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(server.command, server.args || [], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let initialized = false;
    let toolsRequested = false;
    let statusRequested = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (!child.killed) child.kill();
      resolvePromise({ ...result, duration_ms: Date.now() - startedAt, stderr: stderr.slice(-2000) });
    };
    const send = (message) => {
      if (child.stdin.destroyed || !child.stdin.writable) {
        return finish({ status: "unhealthy", reason: "server_input_closed" });
      }
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return null;
    };
    const inspect = () => {
      for (const message of parseJsonLines(stdout)) {
        if ([1, 2, 3].includes(message.id) && message.error) {
          return finish({
            status: "unhealthy",
            reason: "mcp_error_response",
            request_id: message.id,
            error_code: message.error.code
          });
        }
        if (message.id === 1 && message.result && !initialized) {
          initialized = true;
          send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        }
        if (message.id === 2 && Array.isArray(message.result?.tools) && !toolsRequested) {
          toolsRequested = true;
          const tools = message.result.tools.map((tool) => tool.name);
          const missing = REQUIRED_MCP_TOOLS.filter((name) => !tools.includes(name));
          if (missing.length) return finish({ status: "unhealthy", reason: "required_tools_missing", tools, missing_tools: missing });
          send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "server_status", arguments: {} } });
        }
        if (message.id === 3 && message.result && !statusRequested) {
          statusRequested = true;
          if (message.result.isError === true) {
            return finish({ status: "unhealthy", reason: "server_status_failed" });
          }
          if (!message.result.structuredContent && !Array.isArray(message.result.content)) {
            return finish({ status: "unhealthy", reason: "invalid_server_status_result" });
          }
          return finish({ status: "healthy", server_info: message.result, tools: message.result?.structuredContent?.mcp_tools || [] });
        }
      }
      return null;
    };
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); inspect(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.stdin.on("error", (error) => finish({ status: "unhealthy", reason: error.code || "server_input_failed" }));
    child.on("error", (error) => finish({ status: "unavailable", reason: error.code || "spawn_failed" }));
    child.on("close", (code) => finish({ status: "unhealthy", reason: "server_exited", exit_code: code }));
    timer = setTimeout(() => finish({ status: "unhealthy", reason: "connection_timeout" }), timeoutMs);
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vibecode-harness", version: "0.2.0" } }
    });
  });
}

export async function inspectCodexMcp(configPath) {
  if (!(await exists(configPath))) return { status: "missing", location: configPath };
  const text = await readFile(configPath, "utf8");
  const matches = text.match(managedCodexPattern()) || [];
  if (matches.length === 1 && !sectionOutsideManagedBlock(text)) return { status: "configured", location: configPath };
  if (sectionOutsideManagedBlock(text)) return { status: "unmanaged_or_conflicting", location: configPath };
  return { status: "missing", location: configPath };
}

export async function inspectJsonMcp(configPath) {
  if (!(await exists(configPath))) return { status: "missing", location: configPath };
  try {
    const parsed = parseJsonDocument(await readFile(configPath, "utf8"));
    return parsed?.mcpServers?.[MCP_SERVER_NAME]
      ? { status: "configured", location: configPath }
      : { status: "missing", location: configPath };
  } catch {
    return { status: "invalid_configuration", location: configPath };
  }
}
