import { config } from "./config.js";

const DASHBOARD_ROW_ID = "678810d9-7734-4ff7-a21e-dabef366c7fb";
const START_DATE_KST = "2026-03-23";
const TOTAL_DAYS = 20;
const TOTAL_PEOPLE = 20;

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

function formatKstDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getDayIndex(todayKst) {
  const start = new Date(`${START_DATE_KST}T00:00:00+09:00`);
  const today = new Date(`${todayKst}T00:00:00+09:00`);
  const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 0;
  }

  return Math.min(diffDays + 1, TOTAL_DAYS);
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

async function getTeamMemberRows() {
  const members = [];

  for (const dataSourceId of config.teamDataSourceIds) {
    const rows = await queryAllRows(dataSourceId);
    for (const row of rows) {
      members.push(row);
    }
  }

  return members;
}

export async function updateDashboardWidget() {
  const todayKst = formatKstDate();
  const dayIndex = getDayIndex(todayKst);
  const targetProperty = dayIndex > 0 ? `Day${dayIndex}` : null;

  const members = await getTeamMemberRows();
  const participantCount = targetProperty
    ? members.filter((member) => member.properties?.[targetProperty]?.checkbox === true).length
    : 0;
  const progressText = dayIndex > 0 ? `${dayIndex}/${TOTAL_DAYS}일째` : `시작 전 (0/${TOTAL_DAYS})`;

  await notionRequest(`/pages/${DASHBOARD_ROW_ID}`, {
    method: "PATCH",
    body: {
      properties: {
        "오늘 N일차": {
          number: dayIndex
        },
        "오늘 인증 인원": {
          number: participantCount
        },
        "전체 인원": {
          number: TOTAL_PEOPLE
        },
        "진행표시": {
          rich_text: [
            {
              type: "text",
              text: {
                content: progressText
              }
            }
          ]
        },
        "날짜": {
          date: {
            start: todayKst
          }
        }
      }
    }
  });

  return {
    todayKst,
    dayIndex,
    participantCount,
    progressText
  };
}
