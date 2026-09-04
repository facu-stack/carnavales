import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadVotingState,
  saveVotingState,
  clearVotingState,
} from "./voting-storage.js";

test("voting-storage", () => {
  test("returns empty state when nothing is stored", () => {
    sessionStorage.clear();
    assert.deepEqual(loadVotingState(), { scores: {}, confirmed: [] });
  });

  test("round-trips saved scores and confirmed", () => {
    clearVotingState();
    saveVotingState({ 0: { 2: 10 } }, [0]);
    assert.deepEqual(loadVotingState(), { scores: { 0: { 2: 10 } }, confirmed: [0] });
  });

  test("tolerates corrupted stored JSON", () => {
    sessionStorage.setItem("carnavales.voting-session", "{not-json");
    assert.deepEqual(loadVotingState(), { scores: {}, confirmed: [] });
  });
});