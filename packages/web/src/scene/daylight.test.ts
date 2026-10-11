import { describe, expect, it } from "vitest";
import { daylightAt, hourAt, parseTimeOverride, sunDirection } from "./daylight";

describe("daylightAt", () => {
  it("is full daylight at noon with the lamps off", () => {
    const d = daylightAt(12);
    expect(d.interior).toBe(0);
    expect(d.lampsOn).toBe(false);
    expect(d.key.dir[1]).toBeGreaterThan(0.7);
    expect(d.sky.stars).toBe(0);
    expect(d.sky.moon).toBe(false);
  });

  it("is lit from the ceiling at midnight with the lamps on and stars out", () => {
    const d = daylightAt(0);
    expect(d.interior).toBe(1);
    expect(d.lampsOn).toBe(true);
    expect(d.sky.stars).toBe(1);
    expect(d.sky.moon).toBe(true);
    expect(d.sky.lit).toBeGreaterThan(0.5);
    // ceiling fittings: almost straight down
    expect(d.key.dir[1]).toBeGreaterThan(0.8);
  });

  it("sends the late-afternoon sun in low through the west windows", () => {
    const [x, y] = sunDirection(17.5);
    expect(x).toBeLessThan(-0.8);
    expect(y).toBeLessThan(0.45);
    expect(daylightAt(17.5).lampsOn).toBe(false);
  });

  it("brings the sun up on the camera's side in the morning", () => {
    const [x, y] = sunDirection(8);
    expect(x).toBeGreaterThan(0.5);
    expect(y).toBeGreaterThan(0.3);
  });

  it("switches the lamps on through dusk and keeps them on overnight", () => {
    expect(daylightAt(18.75).lampsOn).toBe(true);
    expect(daylightAt(21).lampsOn).toBe(true);
    expect(daylightAt(5.5).lampsOn).toBe(true);
    expect(daylightAt(7.5).lampsOn).toBe(false);
  });

  it("wraps midnight without a seam", () => {
    const a = daylightAt(23.99);
    const b = daylightAt(0.01);
    expect(a.key.intensity).toBeCloseTo(b.key.intensity, 3);
    expect(a.page.top).toBe(b.page.top);
    expect(daylightAt(-1).hour).toBe(23);
    expect(daylightAt(25).hour).toBe(1);
  });

  it("interpolates smoothly between keyframes", () => {
    const h10 = daylightAt(10).key.intensity;
    const h17 = daylightAt(17).key.intensity;
    const h18 = daylightAt(18.25).key.intensity;
    expect(h17).toBeLessThan(h10);
    expect(h18).toBeLessThan(h17);
    for (let h = 0; h < 24; h += 0.25) {
      const d = daylightAt(h);
      expect(d.interior).toBeGreaterThanOrEqual(0);
      expect(d.interior).toBeLessThanOrEqual(1);
      expect(d.sky.top).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("time override", () => {
  it("parses hours, hour:minute and decimals", () => {
    expect(parseTimeOverride("?time=21")).toEqual({ kind: "fixed", hour: 21 });
    expect(parseTimeOverride("?preview=still&time=7:30")).toEqual({ kind: "fixed", hour: 7.5 });
    expect(parseTimeOverride("?time=17.25")).toEqual({ kind: "fixed", hour: 17.25 });
    expect(parseTimeOverride("?time=cycle")).toEqual({ kind: "cycle" });
  });

  it("ignores missing or invalid values", () => {
    expect(parseTimeOverride("?preview")).toBeNull();
    expect(parseTimeOverride("?time=")).toBeNull();
    expect(parseTimeOverride("?time=25")).toBeNull();
    expect(parseTimeOverride("?time=noon")).toBeNull();
  });

  it("reads the wall clock when there is no override", () => {
    const now = new Date(2026, 9, 11, 14, 30, 0).getTime();
    expect(hourAt(now, null)).toBeCloseTo(14.5, 5);
    expect(hourAt(now, { kind: "fixed", hour: 3 })).toBe(3);
    const cycle = hourAt(12_000, { kind: "cycle" });
    expect(cycle).toBeGreaterThan(0);
    expect(cycle).toBeLessThan(24);
  });
});
