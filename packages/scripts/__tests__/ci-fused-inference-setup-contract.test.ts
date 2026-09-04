/**
 * Verifies that generic CI workspace setup cannot provision desktop inference
 * and that the three build lanes responsible for desktop artifacts opt in.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Step = {
  name?: string;
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
};

type Workflow = {
  jobs: Record<string, { steps: Step[] }>;
};

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function readYaml(relativePath: string): Record<string, unknown> {
  return Bun.YAML.parse(
    readFileSync(`${repoRoot}${relativePath}`, "utf8"),
  ) as Record<string, unknown>;
}

function workspaceSetup(workflowPath: string, jobName: string): Step {
  const workflow = readYaml(workflowPath) as Workflow;
  const step = workflow.jobs[jobName]?.steps.find(
    (candidate) => candidate.uses === "./.github/actions/setup-bun-workspace",
  );
  if (!step)
    throw new Error(`${workflowPath}:${jobName} has no workspace setup`);
  return step;
}

function namedStep(
  workflowPath: string,
  jobName: string,
  stepName: string,
): Step {
  const workflow = readYaml(workflowPath) as Workflow;
  const step = workflow.jobs[jobName]?.steps.find(
    (candidate) => candidate.name === stepName,
  );
  if (!step) throw new Error(`${workflowPath}:${jobName} has no ${stepName}`);
  return step;
}

describe("CI fused inference setup ownership", () => {
  test("generic workspace setup skips desktop provisioning by default", () => {
    const action = readYaml(
      ".github/actions/setup-bun-workspace/action.yml",
    ) as {
      inputs: Record<string, { default?: string }>;
      runs: { steps: Step[] };
    };
    expect(action.inputs["setup-fused-inference"]?.default).toBe("false");

    const postinstall = action.runs.steps.find(
      (step) => step.name === "Run repository postinstall",
    );
    expect(postinstall?.env?.ELIZA_SKIP_FUSED_INFERENCE_SETUP).toContain(
      "inputs.setup-fused-inference == 'true'",
    );
    expect(postinstall?.env?.ELIZA_SKIP_FUSED_INFERENCE_SETUP).toContain(
      "|| '1'",
    );
  });

  test("only desktop artifact contract and release build lanes opt in", () => {
    expect(
      workspaceSetup(".github/workflows/test.yml", "desktop-contract").with?.[
        "setup-fused-inference"
      ],
    ).toBe("true");
    expect(
      workspaceSetup(".github/workflows/electrobun-contract.yml", "flatpak-e2e")
        .with?.["setup-fused-inference"],
    ).toBe("true");
    expect(
      namedStep(
        ".github/workflows/release-electrobun.yml",
        "build",
        "Run repository postinstall patches",
      ).env?.ELIZA_SKIP_FUSED_INFERENCE_SETUP,
    ).toBe("0");

    expect(
      workspaceSetup(
        ".github/workflows/electrobun-contract.yml",
        "release-contract",
      ).with?.["setup-fused-inference"],
    ).toBeUndefined();
  });
});
