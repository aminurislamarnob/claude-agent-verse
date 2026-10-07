import { describe, it, expect } from "vitest";
import { updateHooks, HOOKS, TAG } from "./hooks-cli.js";

describe("hooks-cli", () => {
  const forwarderCommand = `tsx /mock/path/forwarder.ts ${TAG}`;
  const newHookEntry = { type: "command", command: forwarderCommand };

  describe("install", () => {
    it("adds entries for all forwarder events when hooks object is missing", () => {
      const settings = {};
      const { changed, nextSettings } = updateHooks(settings, "install", forwarderCommand);
      
      expect(changed).toBe(true);
      expect(nextSettings.hooks).toBeDefined();
      
      for (const hookName of HOOKS) {
        expect(nextSettings.hooks[hookName]).toEqual(newHookEntry);
      }
    });

    it("preserves pre-existing third-party hooks and adds ours", () => {
      const settings = {
        hooks: {
          PreToolUse: [
            { type: "command", command: "block-dangerous-git.sh" }
          ],
          SessionStart: "echo welcome"
        }
      };

      const { changed, nextSettings } = updateHooks(settings, "install", forwarderCommand);
      
      expect(changed).toBe(true);
      expect(nextSettings.hooks.PreToolUse).toEqual([
        { type: "command", command: "block-dangerous-git.sh" },
        newHookEntry
      ]);
      expect(nextSettings.hooks.SessionStart).toEqual([
        "echo welcome",
        newHookEntry
      ]);
      
      // Other hooks should just have our entry
      expect(nextSettings.hooks.Notification).toEqual(newHookEntry);
    });

    it("is idempotent (running twice produces no duplicates)", () => {
      const settings = {};
      const first = updateHooks(settings, "install", forwarderCommand);
      expect(first.changed).toBe(true);

      const second = updateHooks(first.nextSettings, "install", forwarderCommand);
      expect(second.changed).toBe(false);
      expect(second.nextSettings).toEqual(first.nextSettings);
      
      // Ensure there is only one entry per hook
      for (const hookName of HOOKS) {
        expect(second.nextSettings.hooks[hookName]).toEqual(newHookEntry);
      }
    });
  });

  describe("uninstall", () => {
    it("removes exactly the tagged entries and leaves others intact", () => {
      const settings = {
        hooks: {
          PreToolUse: [
            { type: "command", command: "block-dangerous-git.sh" },
            newHookEntry,
            "another_hook"
          ],
          SessionStart: [
            newHookEntry
          ],
          SessionEnd: "echo bye" // untouched string
        },
        otherSetting: true
      };

      const { changed, nextSettings } = updateHooks(settings, "uninstall", forwarderCommand);
      
      expect(changed).toBe(true);
      
      // Removed ours, kept others
      expect(nextSettings.hooks.PreToolUse).toEqual([
        { type: "command", command: "block-dangerous-git.sh" },
        "another_hook"
      ]);
      
      // SessionStart was only ours, so it should be removed from the hooks object
      expect(nextSettings.hooks.SessionStart).toBeUndefined();
      
      // SessionEnd had no tag, should remain untouched (as a string, not an array)
      expect(nextSettings.hooks.SessionEnd).toBe("echo bye");
      
      // Root structure is intact
      expect(nextSettings.otherSetting).toBe(true);
    });

    it("deletes the hooks object if it becomes empty", () => {
      const settings = {
        hooks: {
          PreToolUse: [newHookEntry],
          SessionStart: [newHookEntry]
        }
      };

      const { changed, nextSettings } = updateHooks(settings, "uninstall", forwarderCommand);
      
      expect(changed).toBe(true);
      expect(nextSettings.hooks).toBeUndefined();
    });

    it("does nothing if hooks are not present", () => {
      const settings = { other: "value" };
      const { changed, nextSettings } = updateHooks(settings, "uninstall", forwarderCommand);
      
      expect(changed).toBe(false);
      expect(nextSettings).toEqual(settings);
    });
  });
});
