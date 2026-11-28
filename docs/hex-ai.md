# Build a Hex player

Start with the decision on a single turn. The app supplies the position, the
side to move, and whether the pie rule is available. Return one legal action.
The game controller owns the board, timers and network connection. The browser
runs its search in a Web Worker, which lets the menu and board continue receiving
input while the bot thinks. Restarting a game cancels the outstanding search.

## Try a position

The Java bot is in [hex-ai](https://github.com/Xlythe/hex-ai). From an Android
Hex checkout with JDK 21 installed, run:

```sh
jshell --class-path app/libs/hex-ai.jar:app/libs/hex-core.jar:app/libs/gson-2.2.4.jar
```

```java
import com.hex.ai.TreeGameAI;
// Each group is one column, from top to bottom. Red to move.
byte[] board = {1, 2, 0,   1, 2, 0,   0, 0, 0};
int action = TreeGameAI.choose(board, 3, 1, false, 100, 42L);
// 6 means column 2, row 0 (C1). Red connects left to right.
```

The Java search packs a cell as `column * size + row`. The web UI stores
`board[row][column]`. Use the adapter in [AiPlayerTree.ts](../AiPlayerTree.ts)
when comparing them. Empty cells are 0. Red is 1 and connects left to right.
Blue is 2 and connects top to bottom. The Java swap action is `size * size`.
When Blue swaps B1, remove the red stone on B1 and put a blue stone on A2.

## Build up the strategy

1. Write a legal-move generator and a six-neighbor flood fill. Test empty
   boards, both edge connections, an occupied cell, and diagonal and off-axis
   swaps. A connected path ends the game immediately.
2. For each candidate, try it on a copy. Return an immediate win. Otherwise
   block an opponent who could win next turn. This small bot gives you a
   baseline you can understand by looking at its moves.
3. Give quiet positions a score. Find the cheapest route between each side's
   edges. Entering your stone costs 0, an empty cell costs 1, and the opponent's
   stones are impassable. Prefer a move that shortens your route or lengthens
   theirs. This estimate can miss a forced connection, so test it against
   positions where two different replies preserve a bridge.
4. Add Monte Carlo tree search. Each simulation selects a promising child,
   expands a legal action, plays to a result, and propagates the result back
   up the tree. Count a win from the correct side's perspective at each node.
   Return the most visited root action. In the example, 100 is the simulation
   budget and 42 seeds the random generator. Both are useful tuning controls.
5. Evaluate changes with paired games. Replay an opening twice with colors
   exchanged, use several seeds, and include swap openings. Test against the
   previous bot as well as random play. Record wins, illegal moves, and
   median and slowest turn times on the target phone. Save surprising losses
   as replay fixtures before changing the heuristic.

The Java tactical and tournament tests live in
[hex-ai/tests/com/hex/ai](https://github.com/Xlythe/hex-ai/tree/master/tests/com/hex/ai).
The web suite has deterministic tactical fixtures in
[AiPlayerTree.spec.ts](../AiPlayerTree.spec.ts). Use the same positions in
both suites before comparing the strength of the two implementations.
