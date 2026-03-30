import { config } from "./config.js";
import { formatDateAsKst } from "./business-day.js";
import { saveRateSnapshot } from "./history-store.js";
import {
  buildRateHistory,
  buildRateHistoryNotice,
  calculateRate,
  countCheckedMembers,
  filterCountedMembers
} from "./rate-summary.js";
import { getProgramDateForDay, getProgramDayIndex, PROGRAM_TOTAL_DAYS } from "./schedule.js";

const PREMIUM_DASHBOARD_DATA_SOURCE_ID = "3291fc05-de1e-81d7-a1cc-000bbfadc3b3";
const PREMIUM_DASHBOARD_ROW_ID = "3291fc05-de1e-8115-9068-c81b4b4ff5ab";

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
  return formatDateAsKst(date);
}

function getSnapshotDateForDay(day) {
  return getProgramDateForDay(day);
}

function getDayIndex(todayKst) {
  return getProgramDayIndex(todayKst);
}

async function getDashboardRow(pageId) {
  return notionRequest(`/pages/${pageId}`);
}

function resolveTotalPeople(manualValue, fallbackValue) {
  if (typeof manualValue === "number" && Number.isFinite(manualValue) && manualValue > 0) {
    return manualValue;
  }

  return fallbackValue;
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
  const allMembers = await getPremiumMemberRows();
  const members = filterCountedMembers(allMembers);
  const dashboardRow = await getDashboardRow(PREMIUM_DASHBOARD_ROW_ID);
  const totalPeople = resolveTotalPeople(
    dashboardRow.properties?.["전체 인원"]?.number,
    members.length
  );
  const participantCount = targetProperty ? countCheckedMembers(members, targetProperty) : 0;
  const currentRate = calculateRate(participantCount, totalPeople);
  const rateHistory = buildRateHistory(dayIndex, PROGRAM_TOTAL_DAYS, members, totalPeople);
  const rateHistoryNotice = buildRateHistoryNotice(
    dayIndex,
    PROGRAM_TOTAL_DAYS,
    rateHistory,
    totalPeople
  );
  const progressText =
    dayIndex > 0 ? `${dayIndex}/${PROGRAM_TOTAL_DAYS}일째` : `시작 전 (0/${PROGRAM_TOTAL_DAYS})`;

  await notionRequest(`/pages/${PREMIUM_DASHBOARD_ROW_ID}`, {
    method: "PATCH",
    body: {
      properties: {
        "오늘 N일차": { number: dayIndex },
        "오늘 인증 인원": { number: participantCount },
        "전체 인원": { number: totalPeople },
        "진행표시": {
          rich_text: [
            {
              type: "text",
              text: { content: progressText }
            }
          ]
        },
        "공지": {
          rich_text: [
            {
              type: "text",
              text: {
                content: rateHistoryNotice
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

  await saveRateSnapshot({
    segment: "프리미엄",
    date: todayKst,
    dayIndex,
    participantCount,
    totalPeople,
    rate: currentRate
  });

  for (const { day, checkedCount, rate } of rateHistory) {
    await saveRateSnapshot({
      segment: "프리미엄",
      date: getSnapshotDateForDay(day),
      dayIndex: day,
      participantCount: checkedCount,
      totalPeople,
      rate
    });
  }

  return {
    dataSourceId: PREMIUM_DASHBOARD_DATA_SOURCE_ID,
    rowId: PREMIUM_DASHBOARD_ROW_ID,
    todayKst,
    dayIndex,
    participantCount,
    totalPeople,
    currentRate,
    rateHistory,
    progressText
  };
}
