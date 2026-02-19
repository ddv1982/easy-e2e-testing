import { describe, expect, it } from "vitest";
import { detectVolatilityFlags } from "./volatility-detection.js";

describe("detectVolatilityFlags", () => {
  it("returns empty array for stable short text", () => {
    expect(detectVolatilityFlags("Submit form")).toEqual([]);
  });

  it("detects numeric fragments", () => {
    const flags = detectVolatilityFlags("Score: 42 points");
    expect(flags).toContain("contains_numeric_fragment");
  });

  it("detects date fragments", () => {
    const flags = detectVolatilityFlags("Published 2026-02-19");
    expect(flags).toContain("contains_date_or_time_fragment");
  });

  it("detects time fragments", () => {
    const flags = detectVolatilityFlags("Updated at 12:30");
    expect(flags).toContain("contains_date_or_time_fragment");
  });

  it("detects weather/news volatile keywords", () => {
    expect(detectVolatilityFlags("breaking news alert")).toContain("contains_weather_or_news_fragment");
    expect(detectVolatilityFlags("liveblog updates")).toContain("contains_weather_or_news_fragment");
    expect(detectVolatilityFlags("winterweer verwacht")).toContain("contains_weather_or_news_fragment");
    expect(detectVolatilityFlags("live stream")).toContain("contains_weather_or_news_fragment");
    expect(detectVolatilityFlags("video van vandaag")).toContain("contains_weather_or_news_fragment");
  });

  it("detects headline-like text (>= 30 chars, 5+ words, mixed case)", () => {
    const flags = detectVolatilityFlags("Video Dolblije Erben Wennemars viert feest met schaatsploeg");
    expect(flags).toContain("contains_headline_like_text");
  });

  it("does not flag all-lowercase long text as headline-like", () => {
    const flags = detectVolatilityFlags("this is a very long sentence with many words but all lowercase");
    expect(flags).not.toContain("contains_headline_like_text");
  });

  it("does not flag short mixed-case text as headline-like", () => {
    const flags = detectVolatilityFlags("Short Title Here");
    expect(flags).not.toContain("contains_headline_like_text");
  });

  it("detects pipe separator", () => {
    const flags = detectVolatilityFlags("Live Epstein | Trump vindt documenten");
    expect(flags).toContain("contains_pipe_separator");
  });

  it("returns empty for empty/whitespace input", () => {
    expect(detectVolatilityFlags("")).toEqual([]);
    expect(detectVolatilityFlags("   ")).toEqual([]);
  });
});
