# GitHub SSH connection (one-time setup)

The repo is already configured to use SSH. You only need to add this key to your GitHub account **once**.

## 1. Copy this public key (one line)

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMIml9fI7V1doy0gsfn+h0gNpIpcQIfktM7PGLcEn92k tez-terminal-github
```

## 2. Add it to GitHub

1. Open **https://github.com/settings/keys**
2. Click **"New SSH key"**
3. **Title:** e.g. `TezTerminal MacBook`
4. **Key type:** Authentication Key
5. **Key:** Paste the line above
6. Click **"Add SSH key"**

## 3. Push from your machine

```bash
cd ~/Documents/tez-terminal
git push origin main
```

No password prompt — the SSH key authenticates you.

---

**What was configured**

- New SSH key: `~/.ssh/id_ed25519_tez` (private) and `~/.ssh/id_ed25519_tez.pub` (public)
- `~/.ssh/config` uses this key for `github.com`
- Remote URL set to `git@github.com:tezsatish6289/tez-terminal.git`
