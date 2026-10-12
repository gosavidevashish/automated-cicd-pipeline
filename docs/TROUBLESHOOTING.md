# Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `permission denied while trying to connect to the Docker daemon` in a Jenkins build | `jenkins` user not in the `docker` group, or Jenkins not restarted after joining it | `sudo usermod -aG docker jenkins && sudo systemctl restart jenkins` |
| Same error in your own terminal | Your session predates joining the group | Log out and back in, or run `newgrp docker` |
| `cannot create /opt/release-console` or `cannot write to deployments.log` | Folder missing or wrong owner | `sudo bash scripts/setup-ubuntu.sh`, or `sudo chown jenkins:$USER /opt/release-console && sudo chmod 775 /opt/release-console` |
| `bind: address already in use` on port 80 | Another service (often Apache or nginx) holds port 80 | `sudo ss -ltnp 'sport = :80'`, stop that service, or set `HOST_PORT` in the Jenkinsfile to another port |
| Deploy ends with "Rolling back" | New container never became healthy | Read the log lines printed just above, or `docker logs release-console` |
| `NO_PUBKEY` or `signature ... expired` when installing Jenkins | Using the old 2023 Jenkins key | Use `jenkins.io-2026.key`, as `scripts/setup-ubuntu.sh` does |
| Jenkins is slow or the VM freezes | Not enough memory for the VM | Allocate 4 GB, add the swap file from the setup guide, close other applications |
| GitHub push does not start a build | Polling interval not elapsed, or webhook cannot reach Jenkins | Wait up to 2 minutes, or click **Build with Parameters**; for webhooks see the setup guide |
| `Host key verification failed` (EC2 target) | First SSH connection to a new host | The pipeline uses `StrictHostKeyChecking=accept-new`; if the key changed, remove the old entry with `ssh-keygen -R <host>` as the `jenkins` user |
| `Permission denied (publickey)` (EC2 target) | Wrong key or username in the `ec2-ssh-key` credential | Use the `.pem` from the key pair chosen at launch and the username `ubuntu` |
| EC2 page does not load | Security group blocks port 80 | Add an inbound rule for TCP 80 |
| `pull access denied` on EC2 | Private repository or wrong `REGISTRY_REPO` | Make the Docker Hub repository public, or run `docker login` on the instance |
| Page loads but history table is empty | No deployments recorded yet, or the log is not mounted | Run a pipeline build; check `ls -l /opt/release-console/deployments.log` |
| Fonts look different from the screenshots | The server has no internet access for Google Fonts | Expected; the page falls back to Georgia and system fonts |

## Quick checks

```bash
bash scripts/status.sh                                  # overall view
docker ps -a                                            # is the container running?
docker logs --tail 50 release-console                   # why did it stop?
curl -s localhost/health                                # does it answer?
curl -s localhost/api/info                              # which build is it?
sudo journalctl -u jenkins -n 50 --no-pager             # Jenkins's own log
```
