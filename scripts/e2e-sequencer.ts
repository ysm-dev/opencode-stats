import { BaseSequencer, type TestSpecification } from "vitest/node";
import { compareE2e, partitionE2e } from "./e2e-plan.ts";

export class BalancedE2eSequencer extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(
      files.toSorted((left, right) => compareE2e(left.moduleId, right.moduleId)),
    );
  }

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
