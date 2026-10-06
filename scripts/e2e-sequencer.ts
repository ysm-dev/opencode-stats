import { BaseSequencer, type TestSpecification } from "vitest/node";
import { partitionE2e } from "./e2e-plan.ts";

export class BalancedE2eSequencer extends BaseSequencer {
  override shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    const selected = new Set(
      partitionE2e(
        files.map((file) => file.moduleId),
        count,
      )[index - 1],
    );
    return Promise.resolve(files.filter((file) => selected.has(file.moduleId)));
  }
}
