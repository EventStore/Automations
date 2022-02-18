const core = require("@actions/core");
const { graphql } = require("@octokit/graphql");

const token =  core.getInput('github-token');
const organization = core.getInput('organization');
const resourceNodeId = core.getInput('resource-node-id');

const projectNumber = parseInt(core.getInput('project-number'));

if (!projectNumber) {
  var msg = `ProjectNumber '${core.getInput('project-number')}' must be an int.`
  core.setFailed(msg);
  console.log(msg);
  throw msg;
}
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${token}`,
  },
});

async function getProjectId() {
  console.log(`Getting project with number ${projectNumber}`);

  try {
    const { organization: {projectNext: { id }}} = await graphqlWithAuth(`
    query ($org: String!, $number: Int!) {
      organization(login: $org) {
        projectNext(number: $number) {
          id
          fields(first:20) {
            nodes {
              id
              name
              settings
            }
          }
        }
      }
    }`,
    {
      org: organization,
      number: projectNumber
    });
    console.log(`Got project id ${id}`);
    return id;
  } catch (error) {
    core.setFailed(error.message);
    console.log(error.message);
  }
}

async function getItemId(projectId) {
  console.log(`Getting item id from node id ${resourceNodeId}`);

  try {
    const { addProjectNextItem: { projectNextItem: { id }}} = await graphqlWithAuth(`
    mutation(
      $project:ID!,
      $resource_id:ID!
    ) {
      addProjectNextItem(
        input: {
          projectId: $project,
          contentId: $resource_id
        }
      ) {
        projectNextItem {
          id
        }
      }
    }`,
    {
      project: projectId,
      resource_id: resourceNodeId
    });
    console.log(`Got item id ${id}`);
    return id;
  } catch (error) {
    core.setFailed(error.message);
    console.log(error.message);
  }
}

async function removeItemFromProject(projectId, itemId) {
  console.log(`Removing item ${itemId} from Project ${projectId}`);

  try {
    await graphqlWithAuth(`
    mutation (
      $project: ID!
      $item: ID!
    ) {
      deleteProjectNextItem(
        input: {
          projectId: $project
          itemId: $item
        }
      ) {
        deletedItemId
      }
    }`,
    {
      project: projectId,
      item: itemId
    });
    console.log(`Removed Item`);
  } catch (error) {
    core.setFailed(error.message);
    console.log(error.message);
  }
}

async function Run() {
  const projectId = await getProjectId();
  const itemId = await getItemId(projectId);
  await removeItemFromProject(projectId, itemId);
}

Run();