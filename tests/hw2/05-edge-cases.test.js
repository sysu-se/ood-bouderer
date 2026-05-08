import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js';

describe('HW2 edge cases', () => {
	it('failed signatures persist across discard and a fresh exploration', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 });
		expect(game.getExploreFailure()).toMatchObject({ type: 'conflict' });
		game.discardExplore();

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 });
		expect(game.getExploreFailure()).toMatchObject({ type: 'conflict', known: true });
	});

	it('detects dead-end (no candidate fits) as a contradiction', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		// In makePuzzle, (4, 4) only allows 5. Filling 5 elsewhere in row 4 leaves
		// (4, 4) with no candidates — a dead-end without a row/col/box conflict.
		expect(game.guess({ row: 4, col: 1, value: 5 })).toBe(true);

		const failure = game.getExploreFailure();
		expect(failure).toMatchObject({ type: 'dead-end', row: 4, col: 4 });
	});

	it('commitExplore refuses to commit a failed branch and leaves main untouched', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		const before = game.getMainSudoku().toJSON();

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 }); // creates a conflict

		expect(game.commitExplore()).toBe(false);
		expect(game.isExploring()).toBe(true);
		expect(game.getMainSudoku().toJSON()).toEqual(before);
	});

	it('createGameFromJSON rejects history entries that violate initial givens', async () => {
		const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.guess({ row: 0, col: 2, value: 4 });
		const json = JSON.parse(JSON.stringify(game.toJSON()));

		// Tamper an initial-given cell inside a stored history snapshot.
		json.undoStack[0].after.grid[0][0] = 9; // (0, 0) is a given (5).

		expect(() => createGameFromJSON(json)).toThrow(/preserve the initial givens/);
	});

	it('querying exploration failure does not remember the failed signature', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 });

		const failure = game.getExploreFailure();
		expect(failure).toMatchObject({ type: 'conflict', known: false });
		expect(game.getFailedExplorations()).not.toContain(failure.signature);

		game.backtrackExplore();
		expect(game.getFailedExplorations()).toContain(failure.signature);
	});

	it('an empty board produces no hint', async () => {
		const { createSudoku } = await loadDomainApi();
		const empty = createSudoku(Array.from({ length: 9 }, () => Array(9).fill(0)));

		expect(empty.getNextHint()).toBe(null);
	});
});
