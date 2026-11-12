const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildScheduledAgenda,
  inheritAgendaParts,
  insertLogicalBreaks,
  parseAgendaTable,
  rebalanceScheduledRows
} = require("../services/agenda-rules");

test("parses the vertical agenda format and splits a shared duration", () => {
  const rows = parseAgendaTable(`
**Part 1: Fundamentals**
1C (first half)
RU and Indexing
Deck
40 min total for both halves
RU and indexing

1C (second half)
Data Modeling
Deck
(included above)
Partition keys
`);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.durationMinutes), [20, 20]);
  assert.equal(rows[1].part, "Part 1: Fundamentals");
});

test("parses a pasted tab-separated agenda and schedules it consecutively", () => {
  const rows = parseAgendaTable(
    "Part\t#\tSession\tFormat\tDuration\tFocus\nPart 1\t1A\tResource Model\tDeck\t15 min\tContainers\n\t1B\tSDK Basics\tLab\t1 hour\tCRUD"
  );
  const scheduled = buildScheduledAgenda(rows, "2026-10-10T09:00:00.000Z");

  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].startAt.toISOString(), "2026-10-10T09:00:00.000Z");
  assert.equal(scheduled[1].startAt.toISOString(), "2026-10-10T09:15:00.000Z");
  assert.equal(scheduled[1].endAt.toISOString(), "2026-10-10T10:15:00.000Z");
  assert.equal(rows[1].part, "Part 1");
});

test("inherits each part heading until the next explicit part", () => {
  const rows = inheritAgendaParts([
    { part: "Part 1", title: "One" },
    { part: "", title: "Two" },
    { part: "Part 2", title: "Three" },
    { title: "Four" }
  ]);

  assert.deepEqual(rows.map((row) => row.part), ["Part 1", "Part 1", "Part 2", "Part 2"]);
});

test("adds hourly breaks and lunch, then rebalances after duration changes", () => {
  const sessions = Array.from({ length: 5 }, (_, index) => ({
    id: `session-${index + 1}`,
    rowType: "session",
    title: `Session ${index + 1}`,
    durationMinutes: 60
  }));
  const withBreaks = insertLogicalBreaks(sessions);
  const scheduled = rebalanceScheduledRows(withBreaks, "2026-10-10T09:00:00.000Z");

  assert.deepEqual(
    scheduled.map((row) => [row.rowType, row.durationMinutes]),
    [
      ["session", 60],
      ["snack", 5],
      ["session", 60],
      ["snack", 5],
      ["session", 60],
      ["lunch", 45],
      ["session", 60],
      ["snack", 5],
      ["session", 60]
    ]
  );
  assert.equal(scheduled[1].startAt.toISOString(), "2026-10-10T10:00:00.000Z");
  assert.equal(scheduled[2].startAt.toISOString(), "2026-10-10T10:05:00.000Z");
  assert.equal(scheduled.at(-1).endAt.toISOString(), "2026-10-10T15:00:00.000Z");
});
test("keeps tab-separated sessions when the optional Focus column is empty", () => {
  const rows = parseAgendaTable([
    "Part\t#\tSession\tFormat\tDuration\tFocus",
    "Part 1\t1A\tIntroduction\tTalk\t30 min\tOverview",
    "\t1B\tHands-on lab\tLab\t60 min\t"
  ].join("\n"));
  assert.equal(rows.length, 2);
  assert.equal(rows[1].title, "Hands-on lab");
  assert.equal(rows[1].part, "Part 1");
  assert.equal(rows[1].focus, "");
  assert.equal(rows[1].durationMinutes, 60);
});
