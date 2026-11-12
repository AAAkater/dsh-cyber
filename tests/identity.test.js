import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { rewritePromptAssembly } from "../lib/identity.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_SUFFIX = "Your working directory is provided in the runtime context.";

function rewrite(sections, fallbackInject = "") {
  return rewritePromptAssembly({
    sections,
    contexts: [],
    tools: [],
    variables: { provider: "test-provider", model: "test-model" },
  }, fallbackInject, { capabilityProtocol: false });
}

function sectionText(result, name) {
  const section = result.sections.find((item) => item.name === name);
  return section ? section.text : undefined;
}

function suffixSection(result) {
  return result.sections.find((item) => item.name === "deployment:persona-suffix");
}

test("empty persona suffix is replaced with a cwd-free static suffix", () => {
  const result = rewrite([{ name: "deployment:persona-suffix", text: "", order: 10200 }]);

  assert.equal(suffixSection(result)?.text, STATIC_SUFFIX);
  assert.doesNotMatch(suffixSection(result)?.text, /\{\{cwd\}\}/);
});

test("missing persona suffix is added with a cwd-free static suffix", () => {
  const result = rewrite([{ name: "stable-section", text: "Stable text.", order: 1 }]);

  assert.equal(sectionText(result, "stable-section"), "Stable text.");
  assert.equal(suffixSection(result)?.text, STATIC_SUFFIX);
  assert.doesNotMatch(suffixSection(result)?.text, /\{\{cwd\}\}/);
});

test("old official identity suffixes become the static suffix", async (t) => {
  const variants = [
    "You are a coding agent powered by the {{model}} model, running on the DeepSeek Harness. Your working directory is {{cwd}}.",
    "You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
  ];

  for (const [index, text] of variants.entries()) {
    await t.test(`official variant ${index + 1}`, () => {
      const result = rewrite([{ name: "deployment:persona-suffix", text, order: 10200 }]);

      assert.equal(suffixSection(result)?.text, STATIC_SUFFIX);
      assert.doesNotMatch(suffixSection(result)?.text, /\{\{cwd\}\}/);
    });
  }
});

test("legacy cwd-only suffixes become the static suffix", async (t) => {
  const variants = [
    "Working directory: {{cwd}}.",
    "Working directory: {{cwd}}",
    "Your working directory is {{cwd}}.",
  ];

  for (const text of variants) {
    await t.test(text, () => {
      const result = rewrite([{ name: "deployment:persona-suffix", text, order: 10200 }]);

      assert.equal(suffixSection(result)?.text, STATIC_SUFFIX);
      assert.doesNotMatch(suffixSection(result)?.text, /\{\{cwd\}\}/);
    });
  }
});

test("old official identity prefixes keep custom persona text without cwd templates", () => {
  const prefix = [
    "You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
    "",
    "Operator persona: answer concisely.",
  ].join("\n");
  const result = rewrite([
    { name: "deployment:persona-prefix", text: prefix, order: 1 },
    { name: "deployment:persona-suffix", text: "Working directory: {{cwd}}.", order: 10200 },
  ]);

  assert.equal(sectionText(result, "deployment:persona-prefix"), "Operator persona: answer concisely.");
  assert.equal(suffixSection(result)?.text, STATIC_SUFFIX);
  assert.doesNotMatch(JSON.stringify(result.sections), /\{\{cwd\}\}/);
});

test("custom persona suffixes are preserved", () => {
  const result = rewrite([{
    name: "deployment:persona-suffix",
    text: "Keep answers concise.",
    order: 10200,
  }]);

  assert.equal(suffixSection(result)?.text, "Keep answers concise.");
});

test("injected cwd is escaped while model and provider interpolation is preserved", () => {
  const result = rewrite([], [
    "cwd={{cwd}}",
    "model={{model}}",
    "provider={{provider}}",
    "other={{unsupported}}",
  ].join("\n"));

  const inject = sectionText(result, "dsh-purge");
  assert.match(inject, /cwd=\{ \{cwd\}\}/);
  assert.match(inject, /model=\{\{model\}\}/);
  assert.match(inject, /provider=\{\{provider\}\}/);
  assert.match(inject, /other=\{ \{unsupported\}\}/);
});

test("bundle persona suffix does not reference the unregistered cwd variable", async () => {
  const source = await readFile(path.join(REPO_ROOT, "cordis.patch.yml"), "utf8");
  const match = /^\s*personaSuffix:\s*(.+)$/m.exec(source);

  assert.ok(match, "cordis.patch.yml must define personaSuffix");
  assert.equal(match[1].trim(), STATIC_SUFFIX);
  assert.doesNotMatch(match[1], /\{\{cwd\}\}/);
});

