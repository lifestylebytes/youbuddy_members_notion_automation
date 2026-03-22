import { config } from "./config.js";

const PREMIUM_DASHBOARD_DATA_SOURCE_ID = "3291fc05-de1e-81d7-a1cc-000bbfadc3b3";
const PREMIUM_DASHBOARD_ROW_ID = "3291fc05-de1e-8115-9068-c81b4b4ff5ab";
const START_DATE_KST = "2026-03-23";
const TOTAL_DAYS = 20;

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

async function getPremiumMemberRows() {
  return queryAllRows(config.premiumDataSourceId);
}

export async function updatePremiumDashboardWidget() {
  const todayKst = formatKstDate();
  const dayIndex = getDayIndex(todayKst);
  const targetProperty = dayIndex > 0 ? `Day${dayIndex}` : null;
  const members = await getPremiumMemberRows();
  const totalPeople = members.length;
  const participantCount = targetProperty
    ? members.filter((member) => member.properties?.[targetProperty]?.checkbox === true).length
    : 0;
  const rate = totalPeople > 0 ? Math.round((participantCount / totalPeople) * 1000) / 10 : 0;
  const progressText = dayIndex > 0 ? `${dayIndex}/${TOTAL_DAYS}일째` : `시작 전 (0/${TOTAL_DAYS})`;

  await notionRequest(`/pages/${PREMIUM_DASHBOARD_ROW_ID}`, {
    method: "PATCH",
    body: {
      properties: {
        "오늘 N일차": { number: dayIndex },
        "오늘 인증 인원": { number: participantCount },
        "전체 인원": { number: totalPeople },
        "오늘 인증률": { number: rate },
        "진행표시": {
          rich_text: [
            {
              type: "text",
              text: { content: progressText }
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
    dataSourceId: PREMIUM_DASHBOARD_DATA_SOURCE_ID,
    rowId: PREMIUM_DASHBOARD_ROW_ID,
    todayKst,
    dayIndex,
    participantCount,
    totalPeople,
    rate,
    progressText
  };
}
