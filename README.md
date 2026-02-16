# TezTerminal - Singapore Migration Guide (Zero-Copy)

Your US-based server is currently blocked by Binance (`451`). Use the **Integrated Terminal** in this IDE to push your code to GitHub and restore sync via Singapore.

### The "Integrated Terminal" Pipe
Since you see the prompt `studio-6235588950:~/studio/src{main}$`, follow these steps to push all files (including `src`) to GitHub without manual copying:

1. **Go to Root**: In that terminal, type:
   ```bash
   cd ..
   ```
   (This moves you from the `src` folder to the main project folder).

2. **Initialize Git**:
   ```bash
   git init
   git remote add origin https://github.com/tezsatish6289/tez-terminal.git
   ```

3. **Push to GitHub**:
   ```bash
   git add .
   # Note: You may need to configure your GitHub email/name first
   git config --global user.email "your-email@example.com"
   git config --global user.name "TezSatish"
   
   git commit -m "Automated Migration to Asia"
   
   # This will ask for your GitHub username and Personal Access Token
   git push -f origin main
   ```

### Firebase Setup (After Push)
Once the terminal finishes pushing:
1. Go to **App Hosting** in the Firebase Console.
2. Re-create the backend using your `tez-terminal` repo.
3. **CRITICAL**: Select **asia-southeast1 (Singapore)** or **asia-south1 (Mumbai)** as the region.
4. Deploy.

### Why this works:
By pushing from the IDE's terminal, you are using the built-in Git CLI to transfer the entire project structure (all folders and files) to GitHub. Once it's in GitHub, the Singapore region can "see" the code and start the 24/7 sync engine.

**Note on Security**: When the terminal asks for your password, use a **GitHub Personal Access Token**, not your account password.