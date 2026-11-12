const test = require("node:test");
const assert = require("node:assert/strict");

const { buildEventSessionId, buildEventUniquenessKey } = require("../services/event-rules");

test("event uniqueness uses title, date-time, and time zone", () => {
  const base = {
    publisherEmail: " Publisher@Example.com ",
    title: "  Azure   Workshop ",
    startAt: "2026-10-10T09:00:00.000Z",
    endAt: "2026-10-10T17:00:00.000Z",
    timeZone: " UTC "
  };

  assert.equal(
    buildEventUniquenessKey(base),
    buildEventUniquenessKey({
      ...base,
      publisherEmail: "publisher@example.com",
      title: "azure workshop",
      timeZone: "utc"
    })
  );
  assert.notEqual(buildEventUniquenessKey(base), buildEventUniquenessKey({
    ...base,
    startAt: "2026-10-11T09:00:00.000Z",
    endAt: "2026-10-11T17:00:00.000Z"
  }));
  assert.notEqual(buildEventUniquenessKey(base), buildEventUniquenessKey({
    ...base,
    timeZone: "India Standard Time"
  }));
});

test("identical session saves use the same deterministic identity", () => {
  const session = {
    eventId: "event-1",
    rowType: "session",
    title: " Lab Setup ",
    startAt: "2026-10-10T09:00:00.000Z",
    endAt: "2026-10-10T10:00:00.000Z"
  };

  assert.equal(buildEventSessionId(session), buildEventSessionId({
    ...session,
    title: "lab   setup"
  }));
  assert.notEqual(buildEventSessionId(session), buildEventSessionId({
    ...session,
    startAt: "2026-10-10T10:00:00.000Z",
    endAt: "2026-10-10T11:00:00.000Z"
  }));
});
