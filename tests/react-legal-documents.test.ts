import { describe, expect, test } from "bun:test";
import {
  LEGAL_AGREEMENT_VERSION,
  LEGAL_DOCUMENT_UPDATED_AT,
  getLegalCopy,
} from "../src/renderer-react/src/features/legal/legalDocuments";

function sectionText(language: string) {
  const copy = getLegalCopy(language);
  return [...copy.privacySections, ...copy.termsSections]
    .flatMap((section) => [section.title, ...section.paragraphs])
    .join("\n");
}

describe("bilingual legal documents", () => {
  test("exposes a stable versioned copy contract and selects every zh locale as Chinese", () => {
    expect(LEGAL_AGREEMENT_VERSION).toBe(1);
    expect(LEGAL_DOCUMENT_UPDATED_AT).toBe("2026-10-02");
    expect(getLegalCopy("zh-CN").title).toBe("隐私政策与服务条款");
    expect(getLegalCopy("zh-Hant").title).toBe("隐私政策与服务条款");
    expect(getLegalCopy("en-US").title).toBe("Privacy Policy and Terms");
    expect(getLegalCopy("fr-FR").title).toBe("Privacy Policy and Terms");
  });

  test("keeps section identities aligned across locales", () => {
    const english = getLegalCopy("en");
    const chinese = getLegalCopy("zh");

    expect(chinese.privacySections.map((section) => section.id)).toEqual(
      english.privacySections.map((section) => section.id),
    );
    expect(chinese.termsSections.map((section) => section.id)).toEqual(
      english.termsSections.map((section) => section.id),
    );
    expect(english.privacySections.length).toBeGreaterThanOrEqual(6);
    expect(english.termsSections.length).toBeGreaterThanOrEqual(6);
  });

  test("explains local persistence, external model payloads, and credential handling", () => {
    const english = sectionText("en");
    const chinese = sectionText("zh-CN");

    expect(english).toMatch(/SQLite/);
    expect(english).toMatch(/image attachments/);
    expect(english).toMatch(/canvas objects or snapshots/);
    expect(english).toMatch(/local cleartext JSON file/);
    expect(english).toMatch(/provider's terms and privacy policy/);
    expect(chinese).toMatch(/SQLite/);
    expect(chinese).toMatch(/图片附件/);
    expect(chinese).toMatch(/画布对象或快照/);
    expect(chinese).toMatch(/本地明文 JSON 文件/);
  });

  test("describes optional networking, opt-in improvement data, and license boundaries", () => {
    const english = sectionText("en");
    const chinese = sectionText("zh");

    expect(english).toMatch(/Problem-bank checks and downloads/);
    expect(english).toMatch(/off unless you opt in/);
    expect(english).toMatch(/current local desktop build does not provide an improvement upload destination/);
    expect(english).toMatch(/Apache License, Version 2\.0/);
    expect(english).toMatch(/THIRD_PARTY_NOTICES\.md/);
    expect(chinese).toMatch(/题库检查与下载/);
    expect(chinese).toMatch(/主动选择加入/);
    expect(chinese).toMatch(/Apache License, Version 2\.0/);
  });

  test("contains substantive final copy without drafting placeholders or absolute security claims", () => {
    for (const language of ["en", "zh-CN"]) {
      const copy = getLegalCopy(language);
      const text = [copy.intro, copy.acknowledgment, sectionText(language)].join("\n");
      expect(text.length).toBeGreaterThan(2_000);
      expect(text).not.toMatch(/\b(?:TODO|TBD|lorem ipsum|placeholder)\b/i);
      expect(text).not.toMatch(/100%|完全匿名|never connects to the internet/i);
    }
  });
});
