import { describe, expect, it } from "vitest";
import { minimalEdit, type TextReplacement } from "../../src/minimalEdit";

function apply(original: string, edit: TextReplacement | undefined): string {
  if (edit === undefined) {
    return original;
  }
  return original.slice(0, edit.start) + edit.text + original.slice(edit.end);
}

describe("minimalEdit", () => {
  it("produces no edit when the text is already formatted, so the document is not touched", () => {
    expect(minimalEdit("class A {}\n", "class A {}\n")).toBeUndefined();
  });

  it("replaces only the changed middle, so the cursor and folding elsewhere survive", () => {
    const original = "line1\nint  x;\nline3\n";
    const formatted = "line1\nint x;\nline3\n";
    const edit = minimalEdit(original, formatted);
    expect(edit).toEqual({ start: 10, end: 11, text: "" });
    expect(apply(original, edit)).toBe(formatted);
  });

  it("handles a change at the very start without touching the rest of the document", () => {
    const edit = minimalEdit("  class A {}\n", "class A {}\n");
    expect(edit).toEqual({ start: 0, end: 2, text: "" });
  });

  it("handles a change at the very end without touching the rest of the document", () => {
    const edit = minimalEdit("class A {}", "class A {}\n");
    expect(edit).toEqual({ start: 10, end: 10, text: "\n" });
  });

  it("does not count the same characters twice when the common prefix and suffix overlap", () => {
    expect(minimalEdit("aa", "aaa")).toEqual({ start: 2, end: 2, text: "a" });
    expect(minimalEdit("aaa", "aa")).toEqual({ start: 2, end: 3, text: "" });
  });

  it("never splits a surrogate pair, which the editor would widen and corrupt", () => {
    const original = "x\u{1F600}y";
    const formatted = "x\u{1F601}y";
    const edit = minimalEdit(original, formatted);
    expect(edit).toEqual({ start: 1, end: 3, text: "\u{1F601}" });
  });

  it("never splits a CRLF, which has no position inside it in the editor", () => {
    expect(minimalEdit("a\r\nb", "a\rb")).toEqual({
      start: 1,
      end: 3,
      text: "\r",
    });
    expect(minimalEdit("a\r\nb", "a\nb")).toEqual({
      start: 1,
      end: 3,
      text: "\n",
    });
  });

  it.each([
    ["", "class A {}\n"],
    ["class A {}\n", ""],
    ["public  class A {\nint x;\n}\n", "public class A {\n  int x;\n}\n"],
    ["a\r\nb\r\nc", "a\nb\nc"],
    ["\u{1F600}\u{1F600}", "\u{1F600}"],
    ["// 日本語\nint  x;\n", "// 日本語\nint x;\n"],
    ["abcabc", "abc"],
  ])(
    "applying the edit to %j yields exactly the formatter output %j",
    (original, formatted) => {
      expect(apply(original, minimalEdit(original, formatted))).toBe(formatted);
    },
  );
});
