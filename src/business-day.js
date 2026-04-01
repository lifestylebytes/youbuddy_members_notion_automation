function parseKstDate(dateString) {
  // Use KST noon so UTC-hosted runtimes keep the intended KST calendar date.
  return new Date(`${dateString}T12:00:00+09:00`);
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function formatDateAsKst(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function addBusinessDays(startDateKst, businessDayOffset) {
  const date = parseKstDate(startDateKst);
  let remaining = Math.max(0, businessDayOffset);

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (!isWeekend(date)) {
      remaining -= 1;
    }
  }

  return formatDateAsKst(date);
}

export function getBusinessDayIndex(startDateKst, todayKst, totalDays) {
  const start = parseKstDate(startDateKst);
  const today = parseKstDate(todayKst);

  if (today < start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= today && count < totalDays) {
    if (!isWeekend(cursor)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}
