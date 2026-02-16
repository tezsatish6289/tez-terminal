# TezTerminal - Singapore Migration Guide (Zero-Copy)

Your US-based server is currently blocked by Binance (`451`). Use the **Integrated Terminal** at the bottom of this IDE to push your code to GitHub and restore sync via Singapore.

### The "Integrated Terminal" Pipe
Follow these commands **one by one** exactly as written. If a command fails, do not proceed to the next one.

1. **Go to Project Root**:
   `cd ~/studio`

2. **Set your Email (Run this first)**:
   `git config --global user.email "hello@tezterminal.com"`

3. **Set your Name (Run this second)**:
   `git config --global user.name "TezSatish"`

4. **Set your GitHub Destination**:
   `git remote add origin https://github.com/tezsatish6289/tez-terminal.git`
   *(If it says "remote origin already exists", run: `git remote set-url origin https://github.com/tezsatish6289/tez-terminal.git`)*

5. **Stage all files**:
   `git add .`

6. **Commit the changes**:
   `git commit -m "Automated Migration to Asia"`

7. **Push to GitHub**:
   `git push -f origin main`

### Important Security Note:
When the terminal asks for your **Password**, do not use your GitHub login password. You must use a **GitHub Personal Access Token (PAT)**.

### Firebase Setup (After Push)
Once the terminal finishes pushing:
1. Go to **App Hosting** in the Firebase Console.
2. Create a new backend using your `tez-terminal` repo.
3. **CRITICAL**: Select **asia-southeast1 (Singapore)** as the region.
4. Deploy.

Your terminal will then be restored with 24/7 sync capabilities.