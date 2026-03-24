export function countCheckedMembers(members, propertyName) {
  return members.filter((member) => member.properties?.[propertyName]?.checkbox === true).length;
}

export function calculateRate(checkedCount, totalPeople) {
  if (totalPeople <= 0) {
    return 0;
  }

  return Math.round((checkedCount / totalPeople) * 1000) / 10;
}

export function formatRatePercent(rate) {
  return String(Math.round(rate));
}

export function buildRateHistory(dayIndex, totalDays, members, totalPeople) {
  const rates = [];

  for (let day = 1; day <= Math.min(dayIndex, totalDays); day += 1) {
    const checkedCount = countCheckedMembers(members, `Day${day}`);
    rates.push({
      day,
      checkedCount,
      rate: calculateRate(checkedCount, totalPeople)
    });
  }

  return rates;
}

export function buildRateHistoryNotice(dayIndex, totalDays, rates, totalPeople) {
  if (dayIndex <= 0 || rates.length === 0) {
    return `지난 인증률\n시작 전 (0/${totalDays})`;
  }

  const chunks = [];

  for (let index = 0; index < rates.length; index += 5) {
    chunks.push(
      rates
        .slice(index, index + 5)
        .map(
          ({ day, checkedCount, rate }) =>
            `D${day} ${checkedCount}/${totalPeople} (${formatRatePercent(rate)}%)`
        )
        .join(" | ")
    );
  }

  return ["지난 인증률", ...chunks].join("\n");
}
