import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_PATH = path.resolve(process.cwd(), ".env");

function loadDotEnv(envPath = DEFAULT_ENV_PATH) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function normalizeId(value) {
  return String(value || "").replace(/-/g, "").toLowerCase();
}

if (!process.env.NOTION_API_KEY) {
  throw new Error("Missing NOTION_API_KEY");
}

if (!process.env.SHARED_DAY_DATA_SOURCE_ID) {
  throw new Error("Missing SHARED_DAY_DATA_SOURCE_ID");
}

if (!process.env.TEAM_A_DATA_SOURCE_ID || !process.env.TEAM_B_DATA_SOURCE_ID) {
  throw new Error("Missing TEAM_A_DATA_SOURCE_ID or TEAM_B_DATA_SOURCE_ID");
}

export const config = {
  port: Number(process.env.PORT || 3000),
  notionApiKey: process.env.NOTION_API_KEY,
  notionWebhookVerificationToken: process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN || "",
  notionApiVersion: process.env.NOTION_API_VERSION || "2025-09-03",
  teamDatabaseIds: [
    process.env.TEAM_A_DATABASE_ID,
    process.env.TEAM_B_DATABASE_ID
  ].filter(Boolean),
  teamDataSourceIds: [
    process.env.TEAM_A_DATA_SOURCE_ID,
    process.env.TEAM_B_DATA_SOURCE_ID
  ].filter(Boolean),
  normalizedTeamDataSourceIds: [
    process.env.TEAM_A_DATA_SOURCE_ID,
    process.env.TEAM_B_DATA_SOURCE_ID
  ]
    .filter(Boolean)
    .map(normalizeId),
  sharedDayDatabaseId: process.env.SHARED_DAY_DATABASE_ID || "",
  sharedDayDataSourceId: process.env.SHARED_DAY_DATA_SOURCE_ID,
  dayCompletedProperty: process.env.DAY_COMPLETED_PROPERTY || "완료",
  normalizeId
};
