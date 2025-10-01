import { fs, vol } from "memfs";

import { RunNotFoundError, SpecNotFoundError } from "../../src/cli/errors.js";
import {
  CliContext,
  ResolvedSpecPath,
  ensureRunId,
  ensureSpecPath,
  resolveCliContext,
} from "../../src/cli/preflight.js";
import type { RunRecord } from "../../src/run/types.js";
import { GitRepositoryError } from "../../src/utils/errors.js";
import { WorkspaceMissingEntryError } from "../../src/workspace/errors.js";

jest.mock("node:fs/promises", () => fs.promises);

describe("CLI Context", () => {
  beforeEach(() => {
    vol.reset();
    // Set up a mock for process.cwd
    jest.spyOn(process, "cwd").mockReturnValue("/app/voratiq");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("resolveCliContext", () => {
    it("should throw an error if not in a git repository", async () => {
      vol.fromJSON({
        "/app/voratiq/some-file": "",
      });
      await expect(resolveCliContext()).rejects.toThrow(GitRepositoryError);
    });

    it("should throw an error if workspace is required and not found", async () => {
      vol.fromJSON({
        "/app/voratiq/.git": "",
      });
      await expect(resolveCliContext()).rejects.toThrow(
        WorkspaceMissingEntryError,
      );
    });

    it("should not throw an error if workspace is not required and not found", async () => {
      vol.fromJSON({
        "/app/voratiq/.git": "",
      });
      const context: CliContext = await resolveCliContext({
        requireWorkspace: false,
      });
      expect(context.root).toBe("/app/voratiq");
    });

    it("should return the CLI context if workspace is valid", async () => {
      vol.fromJSON({
        "/app/voratiq/.git": "",
        "/app/voratiq/.voratiq/config.json": "{}",
        "/app/voratiq/.voratiq/runs.jsonl": "",
        "/app/voratiq/.voratiq/runs": null,
      });
      const context: CliContext = await resolveCliContext();
      expect(context.root).toBe("/app/voratiq");
      expect(context.workspacePaths.workspaceDir).toBe("/app/voratiq/.voratiq");
    });
  });

  describe("ensureSpecPath", () => {
    beforeEach(() => {
      vol.fromJSON({
        "/app/voratiq/spec.md": "test spec",
      });
    });

    it("should return the resolved spec path if it exists", async () => {
      const specPath: ResolvedSpecPath = await ensureSpecPath(
        "spec.md",
        "/app/voratiq",
      );
      expect(specPath.absolutePath).toBe("/app/voratiq/spec.md");
      expect(specPath.displayPath).toBe("spec.md");
    });

    it("should throw an error if the spec path does not exist", async () => {
      await expect(
        ensureSpecPath("nonexistent.md", "/app/voratiq"),
      ).rejects.toThrow(SpecNotFoundError);
    });
  });

  describe("ensureRunId", () => {
    const runs: RunRecord[] = [
      {
        runId: "123",
        spec: { path: "spec.md" },
        createdAt: new Date().toISOString(),
        baseRevision: "abc",
        rootPath: "/app/voratiq",
        agents: [],
      },
    ];

    it("should return the run if it exists", () => {
      const run: RunRecord = ensureRunId("123", runs);
      expect(run.runId).toBe("123");
    });

    it("should throw an error if the run does not exist", () => {
      expect(() => ensureRunId("456", runs)).toThrow(RunNotFoundError);
    });
  });
});
