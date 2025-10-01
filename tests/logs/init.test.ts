import { renderInitSuccess } from "../../src/logs/init.js";
import type { CreateWorkspaceResult } from "../../src/workspace/index.js";

describe("renderInitSuccess", () => {
  it("should return the success message when new files and directories are created", () => {
    const result: CreateWorkspaceResult = {
      createdDirectories: [".voratiq", ".voratiq/runs"],
      createdFiles: [".voratiq/config.json", ".voratiq/runs.jsonl"],
    };

    const output = renderInitSuccess({ result });

    const expectedOutput = [
      "",
      "Voratiq workspace created.",
      "  - .voratiq/",
      "  - .voratiq/runs/",
      "  - .voratiq/config.json",
      "  - .voratiq/runs.jsonl",
    ].join("\n");

    expect(output).toBe(expectedOutput);
  });

  it('should return the "already exists" message when no new files or directories are created', () => {
    const result: CreateWorkspaceResult = {
      createdDirectories: [],
      createdFiles: [],
    };

    const output = renderInitSuccess({ result });

    const expectedOutput = "\nVoratiq workspace already exists.";

    expect(output).toBe(expectedOutput);
  });

  it("should return the success message with sorted directories and files", () => {
    const result: CreateWorkspaceResult = {
      createdDirectories: [".voratiq/runs", ".voratiq"],
      createdFiles: [".voratiq/runs.jsonl", ".voratiq/config.json"],
    };

    const output = renderInitSuccess({ result });

    const expectedOutput = [
      "",
      "Voratiq workspace created.",
      "  - .voratiq/",
      "  - .voratiq/runs/",
      "  - .voratiq/config.json",
      "  - .voratiq/runs.jsonl",
    ].join("\n");

    expect(output).toBe(expectedOutput);
  });
});
