# Git Workflow

A small, readable workflow suited to one or two contributors.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Always deployable. The Jenkins job builds and deploys this branch. |
| `feature/<short-name>` | One change each, for example `feature/history-table`. |
| `fix/<short-name>` | Bug fixes. |

Work happens on a feature branch and reaches `main` through a pull request on GitHub.

## Day-to-day commands

```bash
git switch main && git pull
git switch -c feature/page-title

# edit, then
git add -A
git commit -m "feat: change page title"
git push -u origin feature/page-title
# open a pull request on GitHub, review, merge
```

## Commit messages

Format: `type: short summary in the present tense`

| Type | Use for |
|---|---|
| `feat` | A visible change or new behaviour |
| `fix` | A bug fix |
| `ci` | Jenkinsfile, scripts, pipeline changes |
| `docs` | Documentation only |
| `test` | Tests only |
| `chore` | Maintenance with no behaviour change |

## First-time repository setup

```bash
git init -b main
git add -A
git commit -m "chore: initial project"
git remote add origin https://github.com/<your-user>/release-console.git
git push -u origin main
```

Never commit secrets. Docker Hub tokens and SSH keys live in Jenkins credentials,
and environment-specific values live in `/opt/release-console/app.env` on the server.
