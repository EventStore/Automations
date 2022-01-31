# Tag Docker Images

Automation to tag docker images according to [RFC 2940](EventStore/EventStore#2940).

## Inputs

## Usage

Example usage to tag manually and once per day at 3AM:

```yaml
name: Tag Docker Images
on:
  schedule:
    - cron: '0 3 * * *' # Every day at 3am UTC.
  workflow_dispatch:
jobs:
  tag-docker-images:
    runs-on: ubuntu-latest
    steps:
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v1
    - name: Login to GitHub Container Registry
      uses: docker/login-action@v1
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    - name: Tag and Push
      uses: EventStore/Automations/tag-docker-images@master