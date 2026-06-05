import { describe, expect, it } from "vitest";
import { sanitizeAniListHtml } from "./sanitizeAniListHtml";

describe("sanitizeAniListHtml", () => {
  it("removes scripts and unsafe links while preserving simple formatting", () => {
    const html =
      '<p>Hello <strong>there</strong><script>alert("x")</script><a href="javascript:alert(1)">bad</a><a href="https://anilist.co">good</a></p>';

    expect(sanitizeAniListHtml(html)).toBe(
      '<p>Hello <strong>there</strong><a>bad</a><a href="https://anilist.co" target="_blank" rel="noreferrer">good</a></p>',
    );
  });
});
