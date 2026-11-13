import type { Config } from '../config';
import { JobRunner, realDeps, type JobDefinition, type RunnerDeps } from './runner';

/**
 * Every job the app has. **There are none in 0.1.0:** the runner, its claims and its stop are built and tested (`runner.test.ts`, `claim.test.ts`),
 * so that the tasks that need a job (pruning, file sweeps, backups, mail, reminders) add a definition here and nothing else.
 */
export const jobs: readonly JobDefinition[] = [];

/**
 * Starts the jobs, or says why not. `WALLET_WORKER=off` runs nothing in this process: when several share a database, one runs the jobs and the
 * others only serve (DESIGN.md §5). Returns the runner, so that the server can stop it.
 */
export function startJobs(
  config: Pick<Config, 'worker'>,
  definitions: readonly JobDefinition[] = jobs,
  deps: RunnerDeps = realDeps,
): JobRunner | undefined {
  if (!config.worker) {
    deps.log('[wallet] jobs: off in this process (WALLET_WORKER=off)');
    return undefined;
  }
  const runner = new JobRunner(deps);
  for (const job of definitions) runner.register(job);
  runner.start();
  deps.log(
    `[wallet] jobs: running ${definitions.length} job${definitions.length === 1 ? '' : 's'}`,
  );
  return runner;
}
