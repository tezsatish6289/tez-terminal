# TezTerminal - Singapore Migration Guide (Zero-Copy)

Your US-based server is currently blocked by Binance (`451`). Use the **Integrated Terminal** at the bottom of this IDE to push your code to GitHub and restore sync via Singapore.

### The "Integrated Terminal" Pipe
Since your terminal shows `~/studio/src{main}$`, you are already inside the project. Run these commands **one by one** to push everything to your GitHub:

1. **Go to Project Root**:
   `cd ~/studio`

2. **Set your GitHub Destination**:
   `git remote add origin https://github.com/tezsatish6289/tez-terminal.git`

3. **Stage all files** (this picks up the `src` folder you need):
   `git add .`

4. **Identify yourself** (so GitHub accepts the push):
   `git config --global user.email "hello@tezterminal.com"`
   `git config --global user.name "TezSatish"`

5. **Commit the changes**:
   `git commit -m "Automated Migration to Asia"`

6. **Push to GitHub**:
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