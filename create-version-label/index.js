const core = require('@actions/core');

const date = new Date();
const yearString = `${date.getFullYear()}`.substr(2);

core.setOutput("version", `${yearString}.${date.getMonth() + 1}`);