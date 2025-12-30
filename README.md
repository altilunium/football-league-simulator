# Football League Simulator

https://rtnf.substack.com/p/shall-we-give-up-now

Usage

- Open `index.html` in a browser. For best results, serve the folder with a small static server (e.g. `npx http-server` or `python -m http.server`) so the app can fetch `sim.txt` using the "Load sim.txt" button.
- Alternatively paste the contents of `sim.txt` into the textarea or use the file input to load it.
- Click `Simulate` to check every club: the app will try to construct one scenario where the club finishes 1st (greedy/backtracking with a short time limit). If it finds one, click "Show scenario" to view the match-by-match decisions.

Additional app: Probabilistic Predictor

- Open `index2.html` to run the tier-based probabilistic predictor. Serve the folder (recommended) so you can use the "Load sim2.txt" button, or paste the contents of `sim2.txt` into the textarea.
- `index2.html` parses an optional `[CLUB TIER]` section (1 = strongest, 2 = normal, 3 = weak). It simulates each future matchday sequentially using tier-based probabilities and shows:
	- Predicted match outcomes by matchday
	- Final standings (Current pts, Final pts, W/D/L from simulated matches)
	- An animated rank-movement SVG chart with hover-to-focus by club

Notes about `index2.html`:
- Default tier for clubs not listed is `2` (normal).
- Probabilities used:
	- Same tier: 33/33/33 (home/draw/away)
	- Strong vs normal: 45/20/35 (strong win/draw/weak win)
	- Strong vs weak: 50/20/30
- Use the "Re-run prediction" button in the animation area to re-simulate (randomized) quickly.

Notes

- The solver uses an optimistic strategy: it assumes the target club wins all its remaining matches and then attempts to assign other match results to prevent rivals exceeding the target's max points. It uses pruning and a short time limit per club; for very large schedules the solver may not find a scenario even when one exists.
- If a club is declared impossible, the tool provides a simple explanatory bound (e.g. target's max points vs an opponent's existing or upper-bound points).


