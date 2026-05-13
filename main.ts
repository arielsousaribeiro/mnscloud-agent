type AgentConfig = {
  apiBase: string;
  name: string;
  hostname: string;
  version: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  agentUUIDFile: string;
  agentTokenFile: string;
  nodeUUIDFile: string;
  apiTokenFile: string;
  capabilities: string[];
  pabxEngine: "asterisk" | "freeswitch";
  recordingsRoots: string[];
  recordingMounts: Array<{ hostRoot: string; containerRoot: string }>;
};

type LeaseJob = {
  jobUUID: string;
  engine: string;
  localPath: string;
  uploadUrl?: string | null;
  uploadMethod?: string | null;
  uploadHeaders?: Record<string, string> | null;
};

type IniConfig = Record<string, Record<string, string>>;

const CONFIG_PATH = "/etc/mnscloud/agent/agent.conf";

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseRecordingMounts(value: string) {
  return parseList(value).map((entry) => {
    const [hostRoot, containerRoot] = entry.split("=").map((item) =>
      item?.trim()
    );
    return hostRoot && containerRoot ? { hostRoot, containerRoot } : null;
  }).filter((item): item is { hostRoot: string; containerRoot: string } =>
    item !== null
  );
}

function parseIni(text: string): IniConfig {
  const config: IniConfig = { default: {} };
  let section = "default";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[([a-zA-Z0-9_.-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      config[section] ??= {};
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) config[section][key] = value;
  }
  return config;
}

function getConfigValue(
  config: IniConfig,
  section: string,
  key: string,
  fallback: string,
) {
  return config[section]?.[key] ?? config.default?.[key] ?? fallback;
}

function getNumber(
  config: IniConfig,
  section: string,
  key: string,
  fallback: number,
) {
  const value = Number(getConfigValue(config, section, key, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function loadConfig(): Promise<AgentConfig> {
  const parsed = parseIni(await Deno.readTextFile(CONFIG_PATH));
  const engine = getConfigValue(parsed, "pabx", "engine", "freeswitch")
    .toLowerCase();
  const pabxEngine = engine === "asterisk" ? "asterisk" : "freeswitch";
  const capabilities = parseList(
    getConfigValue(parsed, "agent", "capabilities", "pabx"),
  );
  return {
    apiBase: getConfigValue(
      parsed,
      "agent",
      "api_base",
      "https://dev1.publichost.cloud",
    ),
    name: getConfigValue(parsed, "agent", "name", "mnscloud-agent"),
    hostname: getConfigValue(parsed, "agent", "hostname", "mnscloud-agent"),
    version: getConfigValue(parsed, "agent", "version", "0.1.0"),
    pollIntervalMs: getNumber(parsed, "agent", "poll_interval_ms", 15_000),
    heartbeatIntervalMs: getNumber(
      parsed,
      "agent",
      "heartbeat_interval_ms",
      60_000,
    ),
    agentUUIDFile: getConfigValue(
      parsed,
      "identity",
      "agent_uuid_file",
      "/var/lib/mnscloud/agent/agent.uuid",
    ),
    agentTokenFile: getConfigValue(
      parsed,
      "identity",
      "agent_token_file",
      "/var/lib/mnscloud/agent/agent.token",
    ),
    nodeUUIDFile: getConfigValue(
      parsed,
      "identity",
      "node_uuid_file",
      "/etc/mnscloud/agent/secrets/node.uuid",
    ),
    apiTokenFile: getConfigValue(
      parsed,
      "identity",
      "api_token_file",
      "/etc/mnscloud/agent/secrets/api.token",
    ),
    capabilities: capabilities.length ? capabilities : ["pabx"],
    pabxEngine,
    recordingsRoots: parseList(
      getConfigValue(
        parsed,
        "recordings",
        "roots",
        "/recordings/freeswitch,/recordings/asterisk",
      ),
    ),
    recordingMounts: parseRecordingMounts(
      getConfigValue(
        parsed,
        "recordings",
        "mounts",
        "/var/lib/freeswitch/recordings=/recordings/freeswitch,/var/spool/asterisk/monitor=/recordings/asterisk",
      ),
    ),
  };
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  extra?: unknown,
) {
  const suffix = extra === undefined ? "" : ` ${JSON.stringify(extra)}`;
  console[level](
    `[mnscloud-agent] ${new Date().toISOString()} ${message}${suffix}`,
  );
}

function apiUrl(config: AgentConfig, path: string) {
  return `${config.apiBase.replace(/\/+$/, "")}/api/v1${path}`;
}

async function readText(path: string) {
  return (await Deno.readTextFile(path)).trim();
}

async function writeSecret(path: string, value: string) {
  await Deno.writeTextFile(path, `${value}\n`, { mode: 0o600 });
}

async function optionalRead(path: string) {
  try {
    return await readText(path);
  } catch {
    return "";
  }
}

function bearerHeaders(token: string, nodeUUID: string, agentUUID?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-mnscloud-node-uuid": nodeUUID,
  };
  if (agentUUID) headers["x-mnscloud-agent-uuid"] = agentUUID;
  return headers;
}

async function jsonRequest<T>(
  config: AgentConfig,
  path: string,
  token: string,
  nodeUUID: string,
  agentUUID: string | undefined,
  body: Record<string, unknown>,
) {
  const response = await fetch(apiUrl(config, path), {
    method: "POST",
    headers: bearerHeaders(token, nodeUUID, agentUUID),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `HTTP ${response.status}`,
    );
  }
  return payload as T;
}

async function ensureEnrollment(config: AgentConfig, nodeUUID: string) {
  const existingUUID = await optionalRead(config.agentUUIDFile);
  const existingToken = await optionalRead(config.agentTokenFile);
  if (existingUUID && existingToken) {
    return { agentUUID: existingUUID, agentToken: existingToken };
  }

  const apiToken = await readText(config.apiTokenFile);
  const result = await jsonRequest<{
    data?: { agentUUID?: string; agentToken?: string };
  }>(config, "/agent/enroll", apiToken, nodeUUID, existingUUID || undefined, {
    agentUUID: existingUUID || undefined,
    name: config.name,
    hostname: config.hostname,
    version: config.version,
    capabilities: config.capabilities,
    assignments: [
      {
        capability: "pabx",
        resourceType: "voip_pabx_server",
        nodeUUID,
        engine: config.pabxEngine,
      },
    ],
  });
  const agentUUID = result.data?.agentUUID;
  const agentToken = result.data?.agentToken;
  if (!agentUUID || !agentToken) {
    throw new Error("Enrollment response missing agent credentials.");
  }
  await writeSecret(config.agentUUIDFile, agentUUID);
  await writeSecret(config.agentTokenFile, agentToken);
  return { agentUUID, agentToken };
}

async function heartbeat(
  config: AgentConfig,
  nodeUUID: string,
  agentUUID: string,
  agentToken: string,
) {
  await jsonRequest(
    config,
    "/agent/heartbeat",
    agentToken,
    nodeUUID,
    agentUUID,
    {
      name: config.name,
      hostname: config.hostname,
      version: config.version,
      capabilities: config.capabilities,
      uptimeSeconds: Math.floor(performance.now() / 1000),
      pabx: { engine: config.pabxEngine },
      assignments: [
        {
          capability: "pabx",
          resourceType: "voip_pabx_server",
          nodeUUID,
          engine: config.pabxEngine,
        },
      ],
      recordingsRoots: config.recordingsRoots,
      recordingMounts: config.recordingMounts,
    },
  );
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function isAllowedLocalPath(path: string, roots: string[]) {
  const normalized = normalizePath(path);
  return roots.some((root) => {
    const normalizedRoot = normalizePath(root).replace(/\/+$/, "");
    return normalized === normalizedRoot ||
      normalized.startsWith(`${normalizedRoot}/`);
  });
}

function resolveReadablePath(path: string, config: AgentConfig) {
  const normalized = normalizePath(path);
  for (const mount of config.recordingMounts) {
    const hostRoot = normalizePath(mount.hostRoot).replace(/\/+$/, "");
    const containerRoot = normalizePath(mount.containerRoot).replace(
      /\/+$/,
      "",
    );
    if (normalized === hostRoot || normalized.startsWith(`${hostRoot}/`)) {
      const suffix = normalized.slice(hostRoot.length).replace(/^\/+/, "");
      const candidate = suffix ? `${containerRoot}/${suffix}` : containerRoot;
      return isAllowedLocalPath(candidate, config.recordingsRoots)
        ? candidate
        : null;
    }
  }
  return isAllowedLocalPath(normalized, config.recordingsRoots)
    ? normalized
    : null;
}

async function failJob(
  config: AgentConfig,
  jobUUID: string,
  nodeUUID: string,
  agentUUID: string,
  agentToken: string,
  code: string,
  message: string,
) {
  await jsonRequest(
    config,
    `/agent/jobs/${jobUUID}/fail`,
    agentToken,
    nodeUUID,
    agentUUID,
    {
      errorCode: code,
      message,
    },
  ).catch((error) =>
    log("warn", "Failed to report job failure.", String(error))
  );
}

async function uploadJob(
  job: LeaseJob,
  config: AgentConfig,
  nodeUUID: string,
  agentUUID: string,
  agentToken: string,
) {
  const readablePath = resolveReadablePath(job.localPath, config);
  if (!readablePath) {
    await failJob(
      config,
      job.jobUUID,
      nodeUUID,
      agentUUID,
      agentToken,
      "PATH_NOT_ALLOWED",
      job.localPath,
    );
    return;
  }
  if (!job.uploadUrl) {
    await failJob(
      config,
      job.jobUUID,
      nodeUUID,
      agentUUID,
      agentToken,
      "UPLOAD_URL_MISSING",
      "No signed upload URL was provided.",
    );
    return;
  }

  let file: Uint8Array;
  try {
    file = await Deno.readFile(readablePath);
  } catch (error) {
    await failJob(
      config,
      job.jobUUID,
      nodeUUID,
      agentUUID,
      agentToken,
      "FILE_NOT_FOUND",
      String(error),
    );
    return;
  }

  const response = await fetch(job.uploadUrl, {
    method: job.uploadMethod || "PUT",
    headers: job.uploadHeaders ?? {},
    body: file,
  });
  if (!response.ok) {
    await failJob(
      config,
      job.jobUUID,
      nodeUUID,
      agentUUID,
      agentToken,
      "UPLOAD_FAILED",
      `HTTP ${response.status}`,
    );
    return;
  }

  await jsonRequest(
    config,
    `/agent/jobs/${job.jobUUID}/complete`,
    agentToken,
    nodeUUID,
    agentUUID,
    {
      size: file.byteLength,
    },
  );
}

async function pollJobs(
  config: AgentConfig,
  nodeUUID: string,
  agentUUID: string,
  agentToken: string,
) {
  const result = await jsonRequest<{ data?: { jobs?: LeaseJob[] } }>(
    config,
    "/agent/jobs/lease",
    agentToken,
    nodeUUID,
    agentUUID,
    { limit: 3, capabilities: config.capabilities },
  );
  for (const job of result.data?.jobs ?? []) {
    await uploadJob(job, config, nodeUUID, agentUUID, agentToken);
  }
}

async function main() {
  const config = await loadConfig();
  const nodeUUID = await readText(config.nodeUUIDFile);
  const { agentUUID, agentToken } = await ensureEnrollment(config, nodeUUID);
  log("info", "Agent started.", {
    config: CONFIG_PATH,
    name: config.name,
    capabilities: config.capabilities,
    pabxEngine: config.pabxEngine,
    nodeUUID,
    agentUUID,
  });

  let lastHeartbeat = 0;
  while (true) {
    try {
      const now = Date.now();
      if (now - lastHeartbeat >= config.heartbeatIntervalMs) {
        await heartbeat(config, nodeUUID, agentUUID, agentToken);
        lastHeartbeat = now;
      }
      await pollJobs(config, nodeUUID, agentUUID, agentToken);
    } catch (error) {
      log("warn", "Agent loop failed.", String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

if (import.meta.main) {
  main().catch((error) => {
    log("error", "Fatal agent error.", String(error));
    Deno.exit(1);
  });
}
