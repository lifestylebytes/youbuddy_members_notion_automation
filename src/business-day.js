function parseKstDate(dateString) {
  return new Date(`${dateString}T00:00:00+09:00`);
}

function isWeekend(date) {
  const day = date.getDay();
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
    date.setDate(date.getDate() + 1);
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
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}
