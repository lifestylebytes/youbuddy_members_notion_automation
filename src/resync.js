import { listBlockChildren, updatePageCheckbox } from "./notion.js";
import { config } from "./config.js";

async function notionRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": config.notionApiVersion,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`Notion API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return payload;
}

function titleToText(titleProperty) {
  return (titleProperty?.title || []).map((item) => item.plain_text || "").join("").trim();
}

function parseDayPropertyName(title) {
  const match = String(title || "").match(/day\s*0*([1-9]|[12]\d|30)\b/i);
  return match ? `Day${Number(match[1])}` : null;
}

async function queryAllRows(dataSourceId) {
  const rows = [];
  let cursor;

  do {
    const payload = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }
    });

    rows.push(...payload.results);
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return rows;
}

export async function getTeamMembers() {
  const members = [];

  for (const dataSourceId of [...config.teamDataSourceIds, config.premiumDataSourceId].filter(Boolean)) {
    const rows = await queryAllRows(dataSourceId);
    for (const row of rows) {
      members.push({
        pageId: row.id,
        name: titleToText(row.properties?.["이름"])
      });
    }
  }

  return members;
}

async function getOriginalFourGiDataSourceId(memberPageId) {
  const children = await listBlockChildren(memberPageId);
  const original = children.results.find(
    (block) => block.type === "child_database" && block.child_database?.title === "4기"
  );

  if (!original) {
    return null;
  }

  const database = await notionRequest(`/databases/${original.id}`);
  return database.data_sources?.[0]?.id || null;
}

export async function syncMemberOverview(member) {
  const dataSourceId = await getOriginalFourGiDataSourceId(member.pageId);
  if (!dataSourceId) {
    return { member: member.name, status: "skipped", reason: "original 4기 not found" };
  }

  const rows = await queryAllRows(dataSourceId);
  const desiredStates = new Map();

  for (let day = 1; day <= 30; day += 1) {
    desiredStates.set(`Day${day}`, false);
  }

  for (const row of rows) {
    const title = titleToText(row.properties?.["이름"]);
    const dayProperty = parseDayPropertyName(title);
    if (!dayProperty) {
      continue;
    }

    desiredStates.set(dayProperty, Boolean(row.properties?.["완료"]?.checkbox));
  }

  for (const [dayProperty, checked] of desiredStates.entries()) {
    await updatePageCheckbox(member.pageId, dayProperty, checked);
  }

  return { member: member.name, status: "ok" };
}

export async function resyncOverview() {
  const members = await getTeamMembers();
  const results = [];

  for (const member of members) {
    const result = await syncMemberOverview(member);
    results.push(result);
  }

  return results;
}
