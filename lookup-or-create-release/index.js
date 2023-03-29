const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({
    auth: core.getInput('github-token'),
});

const getVersionString = () => {
    const type = core.getInput("build-type").toLocaleLowerCase();

    if (type === 'nightly') {
        return 'nightly';
    }

    if (type == 'release') {
        const version = core.getInput("version").toLocaleLowerCase();
        const iteration = core.getInput("iteration").toLocaleLowerCase();
        if (!version) {
            core.setFailed("Release build requires a version to be specified!");
        } else {
            if (iteration) {
                return version + "-" + iteration;
            }
            return version;
        }
    }

    if (type === 'stable') {
        core.setFailed("Stable build not implemented yet!");
    }

    if (type === 'beta') {
        core.setFailed("Beta build not implemented yet!");
    }

    core.setFailed(`Unsupported build type [${type}]`);
};

const getReleaseId = async (release_name) => {
    const owner = core.getInput("owner") || github.context.repo.owner;
    const repo = core.getInput("repo") || github.context.repo.repo;
    const build_type = core.getInput("build-type").toLocaleLowerCase();

    // delete previous nightly if there's one
    if (release_name == 'nightly') {
        cleanupPreviousNightly();
    }

    try {
        let prerelease = true;
        if (build_type === 'stable')
            prerelease = false;

        const response = await octokit.repos.createRelease({
            owner,
            repo,
            tag_name: release_name,
            prerelease,
            name: release_name
        });

        return {
            release_id: response.data.id.toString(),
            upload_url: response.data.upload_url,
        };
    } catch (error) {
        if (error.status === 422) { // If the release already exists.
            try {
                const fallback = await octokit.repos.getReleaseByTag({
                    owner,
                    repo,
                    tag: release_name,
                });

                return {
                    release_id: fallback.data.id.toString(),
                    upload_url: fallback.data.upload_url,
                };
            } catch (newError) {
                core.setFailed(`New Error: ${JSON.stringify(newError, undefined, 4)}`);
            }
        }

        core.setFailed(`Unexpected error when creating a release: ${JSON.stringify(error, undefined, 4)}`);
    }
};

const cleanupPreviousNightly = async () => {
    try {
        const current = await octokit.repos.getReleaseByTag({
            owner,
            repo,
            tag: 'nightly',
        });

        await octokit.repos.deleteRelease({
            owner,
            repo,
            release_id: current.data.id,
        });

        octokit.git.deleteRef({
            owner,
            repo,
            ref: 'nightly',
        });
    } catch {
        // noop
    }
}


const run = async () => {
    const version = getVersionString();
    const release = await getReleaseId(version);

    core.setOutput("version", version);
    core.setOutput("release_id", release.release_id);
    core.setOutput("upload_url", release.upload_url);
};

run().then(() => {}, error => core.setFailed(JSON.stringify(error, undefined, 4)));