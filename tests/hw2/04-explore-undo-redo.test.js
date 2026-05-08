import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js';

describe('HW2 explore undo/redo', () => {
	it('explore-mode undo and redo do not touch the main board', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.guess({ row: 0, col: 2, value: 4 });
		const mainAfterFirstGuess = game.getMainSudoku().toJSON();

		game.startExplore();
		game.guess({ row: 0, col: 5, value: 6 });
		game.guess({ row: 0, col: 6, value: 9 });

		expect(game.canUndo()).toBe(true);
		game.undo();
		expect(game.getSudoku().getGrid()[0][6]).toBe(0);
		expect(game.canRedo()).toBe(true);
		game.redo();
		expect(game.getSudoku().getGrid()[0][6]).toBe(9);

		// Main is untouched throughout explore-mode undo/redo.
		expect(game.getMainSudoku().toJSON()).toEqual(mainAfterFirstGuess);
	});

	it('commit collapses explore-mode undo history into a single main entry', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		const before = game.getMainSudoku().toJSON();

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 4 });
		game.guess({ row: 0, col: 5, value: 6 });
		game.guess({ row: 0, col: 6, value: 9 });

		expect(game.commitExplore()).toBe(true);
		expect(game.canUndo()).toBe(true);

		// One undo on main reverts the entire committed exploration.
		expect(game.undo()).toBe(true);
		expect(game.getMainSudoku().toJSON()).toEqual(before);

		// And one redo replays it.
		expect(game.redo()).toBe(true);
		const after = game.getMainSudoku().getGrid();
		expect(after[0][2]).toBe(4);
		expect(after[0][5]).toBe(6);
		expect(after[0][6]).toBe(9);
	});

	it('discard wipes the explore-mode undo history without affecting main', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		const beforeJson = game.getMainSudoku().toJSON();

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 4 });
		game.guess({ row: 0, col: 5, value: 6 });

		game.discardExplore();
		expect(game.isExploring()).toBe(false);
		expect(game.canUndo()).toBe(false);
		expect(game.canRedo()).toBe(false);
		expect(game.getMainSudoku().toJSON()).toEqual(beforeJson);
	});

	it('serialization round-trip preserves explore-mode undo and redo stacks', async () => {
		const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 4 });
		game.guess({ row: 0, col: 5, value: 6 });
		game.undo(); // reverts the second guess; redo stack now has one entry.

		const restored = createGameFromJSON(JSON.parse(JSON.stringify(game.toJSON())));

		expect(restored.isExploring()).toBe(true);
		expect(restored.canUndo()).toBe(true);
		expect(restored.canRedo()).toBe(true);
		expect(restored.getSudoku().getGrid()[0][2]).toBe(4);
		expect(restored.getSudoku().getGrid()[0][5]).toBe(0);

		// Re-applying redo should bring back the second guess on the restored game.
		restored.redo();
		expect(restored.getSudoku().getGrid()[0][5]).toBe(6);
	});
});
