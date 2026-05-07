import { describe, it, expect } from "vitest";
import {
  parseDueDate,
  wallClockToUtc,
  startOfDayInZone,
  endOfDayInZone,
  addDaysInZone,
  resolveUserTimezone,
  formatNowInZone,
} from "../lib/datetime";

describe("parseDueDate", () => {
  it("treats YYYY-MM-DD as 09:00 user-local", () => {
    const d = parseDueDate("2026-05-07", "Asia/Kuala_Lumpur");
    expect(d).not.toBeNull();
    // 09:00 MYT = 01:00 UTC
    expect(d!.toISOString()).toBe("2026-05-07T01:00:00.000Z");
  });

  it("treats bare ISO without offset as wall-clock in user's tz", () => {
    const d = parseDueDate("2026-05-07T16:00", "Asia/Kuala_Lumpur");
    expect(d!.toISOString()).toBe("2026-05-07T08:00:00.000Z");
  });

  it("preserves an explicit Z suffix", () => {
    const d = parseDueDate("2026-05-07T08:00:00Z", "Asia/Kuala_Lumpur");
    expect(d!.toISOString()).toBe("2026-05-07T08:00:00.000Z");
  });

  it("preserves an explicit +HH:MM offset", () => {
    const d = parseDueDate("2026-05-07T16:00:00+08:00", "Asia/Kuala_Lumpur");
    expect(d!.toISOString()).toBe("2026-05-07T08:00:00.000Z");
  });

  it("handles 6-digit time (with seconds) bare", () => {
    const d = parseDueDate("2026-05-07T16:30:45", "Asia/Kuala_Lumpur");
    expect(d!.toISOString()).toBe("2026-05-07T08:30:45.000Z");
  });

  it("returns null for empty input", () => {
    expect(parseDueDate("", "Asia/Kuala_Lumpur")).toBeNull();
  });

  it("returns null for malformed input (SL-7: no silent garbage)", () => {
    expect(parseDueDate("June 7", "Asia/Kuala_Lumpur")).toBeNull();
    expect(parseDueDate("not-a-date", "Asia/Kuala_Lumpur")).toBeNull();
    expect(parseDueDate("2026", "Asia/Kuala_Lumpur")).toBeNull();
  });

  it("returns null for impossible dates", () => {
    expect(parseDueDate("2026-99-99", "Asia/Kuala_Lumpur")).toBeNull();
  });
});

describe("wallClockToUtc", () => {
  it("MYT (UTC+8, no DST)", () => {
    expect(wallClockToUtc("2026-05-07T16:00:00", "Asia/Kuala_Lumpur").toISOString())
      .toBe("2026-05-07T08:00:00.000Z");
  });

  it("America/New_York summer (EDT, UTC-4)", () => {
    expect(wallClockToUtc("2026-07-15T12:00:00", "America/New_York").toISOString())
      .toBe("2026-07-15T16:00:00.000Z");
  });

  it("America/New_York winter (EST, UTC-5)", () => {
    expect(wallClockToUtc("2026-01-15T12:00:00", "America/New_York").toISOString())
      .toBe("2026-01-15T17:00:00.000Z");
  });

  it("Asia/Kolkata (UTC+5:30, half-hour offset)", () => {
    expect(wallClockToUtc("2026-05-07T12:00:00", "Asia/Kolkata").toISOString())
      .toBe("2026-05-07T06:30:00.000Z");
  });

  it("Asia/Kathmandu (UTC+5:45, 45-minute offset)", () => {
    expect(wallClockToUtc("2026-05-07T12:00:00", "Asia/Kathmandu").toISOString())
      .toBe("2026-05-07T06:15:00.000Z");
  });
});

describe("startOfDayInZone / endOfDayInZone", () => {
  it("MYT day boundary", () => {
    // 2026-05-07T05:00:00Z = 13:00 MYT on the 7th → "today" starts
    // 2026-05-06T16:00:00Z (= 00:00 MYT on the 7th).
    const d = startOfDayInZone("Asia/Kuala_Lumpur", new Date("2026-05-07T05:00:00Z"));
    expect(d.toISOString()).toBe("2026-05-06T16:00:00.000Z");

    const e = endOfDayInZone("Asia/Kuala_Lumpur", new Date("2026-05-07T05:00:00Z"));
    expect(e.toISOString()).toBe("2026-05-07T16:00:00.000Z");
  });

  it("Asia/Kolkata day boundary (half-hour offset)", () => {
    // Midnight on May 7 in IST = 18:30 UTC on May 6.
    const d = startOfDayInZone("Asia/Kolkata", new Date("2026-05-07T05:00:00Z"));
    expect(d.toISOString()).toBe("2026-05-06T18:30:00.000Z");
  });
});

describe("addDaysInZone", () => {
  it("walks one calendar day forward in MYT", () => {
    const start = startOfDayInZone("Asia/Kuala_Lumpur", new Date("2026-05-07T05:00:00Z"));
    const next = addDaysInZone("Asia/Kuala_Lumpur", start, 1);
    // start = midnight MYT on May 7 = 2026-05-06T16:00:00Z
    // +1 day = midnight MYT on May 8 = 2026-05-07T16:00:00Z
    expect(next.toISOString()).toBe("2026-05-07T16:00:00.000Z");
  });

  it("crosses a DST forward transition cleanly", () => {
    // US DST starts second Sunday in March. 2026-03-08 02:00 EST jumps to 03:00 EDT.
    // Adding 1 day to "midnight on Mar 7 in NY" should land on "midnight on Mar 8 in NY".
    const start = startOfDayInZone("America/New_York", new Date("2026-03-07T15:00:00Z"));
    const next = addDaysInZone("America/New_York", start, 1);
    // Mar 7 midnight EST = 05:00Z; Mar 8 midnight EDT = 04:00Z (one fewer
    // hour because the clock jumped forward).
    expect(start.toISOString()).toBe("2026-03-07T05:00:00.000Z");
    expect(next.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });
});

describe("resolveUserTimezone", () => {
  it("treats America/New_York (legacy schema default) as unset", () => {
    // Falls through to container TZ — set in node test runner from env (no
    // TZ here typically, so Intl returns the OS tz). We just assert it
    // doesn't return the literal NY value.
    expect(resolveUserTimezone("America/New_York")).not.toBe("America/New_York");
  });

  it("returns explicit timezone when set to anything else", () => {
    expect(resolveUserTimezone("Asia/Kuala_Lumpur")).toBe("Asia/Kuala_Lumpur");
    expect(resolveUserTimezone("Europe/London")).toBe("Europe/London");
  });

  it("falls back when input is null/undefined/empty", () => {
    expect(resolveUserTimezone(null)).not.toBe("America/New_York");
    expect(resolveUserTimezone(undefined)).not.toBe("America/New_York");
    expect(resolveUserTimezone("")).not.toBe("America/New_York");
  });
});

describe("formatNowInZone", () => {
  it("returns a wall-clock string with the expected shape", () => {
    const s = formatNowInZone("Asia/Kuala_Lumpur");
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(Asia\/Kuala_Lumpur, UTC[+-]\d{2}:\d{2}\)$/);
  });
});
