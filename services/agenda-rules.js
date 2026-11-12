function cleanCell(value) {
  return String(value || "")
    .trim()
    .replace(/^\*\*|\*\*$/g, "")
    .trim();
}

function parseDurationMinutes(value) {
  const text = cleanCell(value).toLowerCase();
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/);
  const minutes = text.match(/(\d+)\s*min/);
  if (hours || minutes) {
    return Math.round(Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0));
  }
  const numeric = text.match(/\d+/);
  return numeric ? Number(numeric[0]) : 0;
}

function normalizeFormat(value) {
  const format = cleanCell(value);
  return format || "Session";
}

function inheritAgendaParts(rows) {
  let currentPart = "";
  return rows.map((row) => {
    const explicitPart = cleanCell(row.part);
    if (explicitPart) {
      currentPart = explicitPart;
    }
    return {
      ...row,
      part: explicitPart || currentPart
    };
  });
}

function parseDelimitedAgenda(lines) {
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : "|";
  const rows = lines
    .map((line) => line.split(delimiter).map(cleanCell).filter((cell, index, cells) =>
      delimiter !== "|" || index > 0 && index < cells.length - 1
    ))
    .filter((cells) => cells.length >= 6);
  const headerIndex = rows.findIndex((cells) =>
    cells.map((cell) => cell.toLowerCase()).includes("session")
    && cells.map((cell) => cell.toLowerCase()).includes("duration")
  );
  return (headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows).map((cells) => ({
    part: cells[0],
    sessionCode: cells[1],
    title: cells[2],
    format: normalizeFormat(cells[3]),
    durationText: cells[4],
    durationMinutes: parseDurationMinutes(cells[4]),
    focus: cells.slice(5).join(delimiter === "\t" ? " " : " | ")
  }));
}

function parseVerticalAgenda(lines) {
  const rows = [];
  let part = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanCell(lines[index]);
    if (/^part\s+\d+/i.test(line)) {
      part = line;
      continue;
    }
    if (!/^\d+[A-Za-z](?:\s*\(.+\))?$/.test(line)) {
      continue;
    }
    rows.push({
      part,
      sessionCode: line,
      title: cleanCell(lines[index + 1]),
      format: normalizeFormat(lines[index + 2]),
      durationText: cleanCell(lines[index + 3]),
      durationMinutes: parseDurationMinutes(lines[index + 3]),
      focus: cleanCell(lines[index + 4])
    });
    index += 4;
  }
  return rows;
}

function resolveSharedDurations(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.sessionCode.replace(/\s*\(.+\)$/, "").toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    const sharedTotal = group.find((row) => /total|both halves/i.test(row.durationText))?.durationMinutes;
    if (sharedTotal && group.length > 1 && group.some((row) => row.durationMinutes === 0)) {
      const perRow = Math.floor(sharedTotal / group.length);
      group.forEach((row, index) => {
        row.durationMinutes = index === group.length - 1
          ? sharedTotal - perRow * (group.length - 1)
          : perRow;
      });
    }
  }
  return rows;
}

function parseAgendaTable(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.includes("\t") ? line : line.trimEnd())
    .filter((line) => line.trim())
    .filter((line) => !/^[-|:\s]+$/.test(line.trim()));
  const rows = lines.some((line) => line.includes("\t") || /^\|.+\|$/.test(line))
    ? parseDelimitedAgenda(lines)
    : parseVerticalAgenda(lines);
  const resolved = resolveSharedDurations(inheritAgendaParts(rows))
    .filter((row) => row.sessionCode && row.title && row.durationMinutes > 0);
  if (!resolved.length) {
    throw new Error("No valid agenda rows found. Include Part, #, Session, Format, Duration, and Focus.");
  }
  return resolved;
}

function buildScheduledAgenda(rows, startAt) {
  let cursor = new Date(startAt);
  if (Number.isNaN(cursor.getTime())) {
    throw new Error("The event start date is invalid.");
  }
  return rows.map((row, index) => {
    const rowStart = new Date(cursor);
    cursor = new Date(cursor.getTime() + row.durationMinutes * 60000);
    return {
      ...row,
      sequence: index + 1,
      rowType: "session",
      startAt: rowStart,
      endAt: new Date(cursor),
      description: row.focus
    };
  });
}

function rebalanceScheduledRows(rows, startAt) {
  let cursor = new Date(startAt);
  if (Number.isNaN(cursor.getTime())) {
    throw new Error("The event start date is invalid.");
  }
  return rows.map((row, index) => {
    const durationMinutes = Number(row.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      throw new Error("Every agenda row needs a positive whole-minute duration.");
    }
    const rowStart = new Date(cursor);
    cursor = new Date(cursor.getTime() + durationMinutes * 60000);
    return {
      ...row,
      sequence: index + 1,
      startAt: rowStart,
      endAt: new Date(cursor)
    };
  });
}

function insertLogicalBreaks(rows) {
  const contentRows = rows.filter((row) => !["lunch", "snack"].includes(String(row.rowType || "session").toLowerCase()));
  const result = [];
  let contentMinutes = 0;
  let minutesSincePause = 0;
  let lunchAdded = false;

  contentRows.forEach((row, index) => {
    const durationMinutes = Number(row.durationMinutes);
    result.push(row);
    contentMinutes += durationMinutes;
    minutesSincePause += durationMinutes;
    if (index === contentRows.length - 1) {
      return;
    }
    if (!lunchAdded && contentMinutes >= 180) {
      result.push({
        rowType: "lunch",
        part: "",
        sessionCode: "",
        title: "Lunch Break",
        format: "Break",
        description: "Automatically added after approximately three hours of content.",
        durationMinutes: 45,
        speakerIds: [],
        proctorIds: []
      });
      lunchAdded = true;
      minutesSincePause = 0;
    } else if (minutesSincePause >= 60) {
      result.push({
        rowType: "snack",
        part: "",
        sessionCode: "",
        title: "Break",
        format: "Break",
        description: "Automatically added after approximately one hour of content.",
        durationMinutes: 5,
        speakerIds: [],
        proctorIds: []
      });
      minutesSincePause = 0;
    }
  });

  return result;
}

module.exports = {
  buildScheduledAgenda,
  inheritAgendaParts,
  insertLogicalBreaks,
  parseAgendaTable,
  parseDurationMinutes,
  rebalanceScheduledRows
};
