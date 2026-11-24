import { describe, expect, it } from "vitest";
import { brandOf, DEFAULT_CONFIG, mergeConfig } from "@/lib/config";

describe("app config", () => {
  it("uses the spec defaults when no config file is present", () => {
    const c = mergeConfig(null);
    expect(c.exceptions.min_change_pct).toBe(30);
    expect(c.exceptions.min_volume).toBe(50);
    expect(c.what_if.shock).toBe(-3);
    expect(c.what_if.indicator).toBe("PMI");
  });

  it("overrides only the keys a config file provides", () => {
    const c = mergeConfig({ exceptions: { min_change_pct: 20 }, theme: { colors: { forecast: "#f97316" } } });
    expect(c.exceptions.min_change_pct).toBe(20);
    expect(c.exceptions.min_volume).toBe(50);
    expect(c.theme.colors["forecast"]).toBe("#f97316");
    expect(c.what_if.shock).toBe(-3);
  });

  it("ignores values of the wrong type", () => {
    const c = mergeConfig({ what_if: { shock: "big" }, animation: { enabled: "yes" } });
    expect(c.what_if.shock).toBe(-3);
    expect(c.animation.enabled).toBe(true);
  });

  it("falls back to meta.json project name for branding", () => {
    expect(brandOf(DEFAULT_CONFIG, "Acme Demand Hub")).toEqual({ name: "Acme", tagline: "Demand Hub" });
    expect(brandOf(mergeConfig({ brand: { name: "Northwind" } }), "Acme Demand Hub").name).toBe("Northwind");
  });
});
