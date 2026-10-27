# Franchise Auction Bluff

A real-time, room-code party game for 2–8 players. The app uses a small built-in Node.js HTTP server and needs no package installation.

## Run on your laptop

1. Install Node.js if it is not already installed: https://nodejs.org/
2. Open PowerShell in this folder.
3. Run `node server.js`.
4. Open http://localhost:3000 in your browser.
5. Create a room, then open a second browser or private window and join with the room code to try a second player.

## Join from a phone

Connect the phone to the same Wi-Fi as the laptop. Find the laptop's local IPv4 address with `ipconfig` (look for IPv4 Address under the active Wi-Fi adapter). On the phone, open `http://<laptop-ip>:3000`, for example `http://192.168.1.24:3000`, then enter the room code. If Windows Firewall asks whether Node.js may accept connections on a private network, allow it. Do not expose the port to the public internet; this first version is intended for a shared local network.

## Rules in the app

- Pick Season (5 rounds) or Quick Match (3 rounds) in the lobby.
- Every player begins with a shared ₹100M match budget. The budget carries across rounds.
- Each round offers three mystery lots. Every player sees one private, always-truthful clue.
- Each lot opens at ₹1M. Raise by at least ₹1M; the highest bid at the end wins and pays from their budget.
- Each lot gets a 15-second auction. A bid in the last three seconds adds three seconds; the clock caps at 18 seconds from lot start.
- A Star Player scores +50, a Trap scores −20, and a 2× card doubles its outcome. Bid spend affects purse, not score.
- If you bid on a Trap identified by your clue and another player outbids you and wins that lot, you earn +10 Bluff Bait points.
- At match end, highest score wins. Ties break by money remaining, then cards won.

Room state is kept in server memory. Restarting the server clears active rooms.
