// Module 1e — team notes on a lead, follow-up time. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanComment, cleanMentions, commentRecipients, isFollowUpTime, COMMENT_MAX_LENGTH } from "../src/leads/commentRules";

test("M1e cleanComment: trims, rejects empty / too long / not text", () => {
  assert.equal(cleanComment("  రేపు మళ్ళీ call చేయాలి  "), "రేపు మళ్ళీ call చేయాలి");
  assert.equal(cleanComment("   "), null);
  assert.equal(cleanComment(""), null);
  assert.equal(cleanComment(5), null);
  assert.equal(cleanComment("x".repeat(COMMENT_MAX_LENGTH)), "x".repeat(COMMENT_MAX_LENGTH));
  assert.equal(cleanComment("x".repeat(COMMENT_MAX_LENGTH + 1)), null);
});

test("M1e cleanMentions: optional, unique, strict", () => {
  assert.deepEqual(cleanMentions(undefined), []);
  assert.deepEqual(cleanMentions([]), []);
  assert.deepEqual(cleanMentions(["a", "b", "a"]), ["a", "b"]);
  assert.equal(cleanMentions("a"), null);
  assert.equal(cleanMentions(["a", 5]), null);
  assert.equal(cleanMentions(["a/b"]), null);
  assert.equal(cleanMentions([""]), null);
  assert.equal(cleanMentions(Array.from({ length: 21 }, (_, i) => `u${i}`)), null);
});

test("M1e commentRecipients: mentioned + assignee, never the author, only people who can open leads", () => {
  const eligible = ["owner", "m1", "m2"];
  assert.deepEqual(commentRecipients({ mentions: ["m2"], assignedTo: "m1", authorUid: "owner", eligible }), ["m2", "m1"]);
  assert.deepEqual(commentRecipients({ mentions: ["owner", "m1"], assignedTo: "m1", authorUid: "m1", eligible }), ["owner"]);
  assert.deepEqual(commentRecipients({ mentions: [], assignedTo: "", authorUid: "owner", eligible }), []);
  assert.deepEqual(commentRecipients({ mentions: ["staff9"], assignedTo: "gone", authorUid: "owner", eligible }), []);
  assert.deepEqual(commentRecipients({ mentions: ["m1", "m1"], assignedTo: "m1", authorUid: "owner", eligible }), ["m1"]);
});

test("M1e isFollowUpTime: empty or 24-hour HH:MM", () => {
  for (const ok of ["", "00:00", "09:05", "18:30", "23:59"]) assert.equal(isFollowUpTime(ok), true, ok);
  for (const bad of ["24:00", "9:05", "18:60", "6pm", "18:30:00", null, 1830]) assert.equal(isFollowUpTime(bad), false, String(bad));
});
