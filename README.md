# TezTerminal - Singapore Migration Guide (Zero-Copy)

Your US-based server is currently blocked by Binance (`451`). Use the **Integrated Terminal** in this IDE to push your code to GitHub and restore sync via Singapore.

### The "Integrated Terminal" Pipe
Since you see the prompt `studio-6235588950:~/studio/src{main}$`, run these commands **one by one**. Do not copy the code blocks, just the text:

1. **Go to Root**:
   cd ..

2. **Set your GitHub Destination**:
   git remote add origin https://github.com/tezsatish6289/tez-terminal.git

3. **Stage all files** (including the `src` folder):
   git add .

4. **Identify yourself** (so GitHub accepts the push):
   git config --global user.email "your-email@example.com"
   git config --global user.name "TezSatish"

5. **Commit the changes**:
   git commit -m "Automated Migration to Asia"

6. **Push to GitHub**:
   git push -f origin main

### Important Security Note:
When the terminal asks for your **Password**, do not use your GitHub login password. You must use a **GitHub Personal Access Token (PAT)**.

### Firebase Setup (After Push)
Once the terminal finishes pushing:
1. Go to **App Hosting** in the Firebase Console.
2. Create a new backend using your `tez-terminal` repo.
3. **CRITICAL**: Select **asia-southeast1 (Singapore)** as the region.
4. Deploy.