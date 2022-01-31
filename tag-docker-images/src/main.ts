import * as core from '@actions/core';
import * as github from '@actions/github';
import * as lib from './lib';
import { getExecOutput } from '@actions/exec';

const image = 'ghcr.io/eventstore/eventstore';

async function run(): Promise<void> {
  try {
    const releases = await lib.getCurrentReleases();
    const dockerTags = lib.getTagListFromReleases('focal', releases);

    core.info('The following tags will be applied:');
    for (const [targetTag, sourceTag] of Object.entries(dockerTags)) {
      core.info(`${sourceTag} => ${targetTag}`);
    }
    for (const [targetTag, sourceTag] of Object.entries(dockerTags)) {
      const source = `${image}:${sourceTag}`;
      const target = `${image}:${targetTag}`;

      await exec('docker', ['pull', source]);
      core.info(`Tagging ${source} as ${target}`);
      await exec('docker', ['tag', source, target]);
      if (Number.isNaN(github.context.runId)) {
        core.warning('Not running in github actions, skip pushing tags.');
        continue;
      }
      await exec('docker', ['push', target]);
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();

async function exec(c: string, args: string[]): Promise<void> {
  const response = await getExecOutput(c, args);
  if (response.exitCode !== 0) {
    throw new Error(response.stderr);
  }
}
