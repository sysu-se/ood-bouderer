import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js';

function makeOneCellPuzzle() {
	return [
		[5, 3, 4, 6, 7, 8, 9, 1, 2],
		[6, 7, 2, 1, 9, 5, 3, 4, 8],
		[1, 9, 8, 3, 4, 2, 5, 6, 7],
		[8, 5, 9, 7, 6, 1, 4, 2, 3],
		[4, 2, 6, 8, 5, 3, 7, 9, 1],
		[7, 1, 3, 9, 2, 4, 8, 5, 6],
		[9, 6, 1, 5, 3, 7, 2, 8, 4],
		[2, 8, 7, 4, 1, 9, 6, 3, 5],
		[3, 4, 5, 2, 8, 6, 1, 7, 0],
	];
}

describe('HW2 hint and explore mode', () => {
	it('provides candidate and next-step hints from Sudoku', async () => {
		const { createSudoku } = await loadDomainApi();

		const sudoku = createSudoku(makePuzzle());
		expect(sudoku.getCandidates({ row: 0, col: 2 })).toEqual([1, 2, 4]);

		const oneCell = createSudoku(makeOneCellPuzzle());
		expect(oneCell.getNextHint()).toMatchObject({
			type: 'single-candidate',
			row: 8,
			col: 8,
			value: 9,
		});
	});

	it('keeps explore changes separate until commit', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		expect(game.startExplore()).toBe(true);
		expect(game.guess({ row: 0, col: 2, value: 4 })).toBe(true);
		expect(game.getSudoku().getGrid()[0][2]).toBe(4);
		expect(game.getMainSudoku().getGrid()[0][2]).toBe(0);

		expect(game.undo()).toBe(true);
		expect(game.getSudoku().getGrid()[0][2]).toBe(0);
		expect(game.redo()).toBe(true);
		expect(game.getSudoku().getGrid()[0][2]).toBe(4);

		expect(game.commitExplore()).toBe(true);
		expect(game.isExploring()).toBe(false);
		expect(game.getMainSudoku().getGrid()[0][2]).toBe(4);

		expect(game.undo()).toBe(true);
		expect(game.getMainSudoku().getGrid()[0][2]).toBe(0);
	});

	it('detects and remembers failed exploration states', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 });

		const firstFailure = game.getExploreFailure();
		expect(firstFailure).toMatchObject({ type: 'conflict', known: false });
		expect(game.getFailedExplorations()).toHaveLength(0);

		game.backtrackExplore();
		expect(game.getFailedExplorations()).toHaveLength(1);
		game.guess({ row: 0, col: 2, value: 5 });

		const repeatedFailure = game.getExploreFailure();
		expect(repeatedFailure).toMatchObject({ type: 'conflict', known: true });
	});

	it('serializes and restores active exploration state', async () => {
		const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 4 });

		const restored = createGameFromJSON(JSON.parse(JSON.stringify(game.toJSON())));

		expect(restored.isExploring()).toBe(true);
		expect(restored.getSudoku().getGrid()[0][2]).toBe(4);
		expect(restored.getMainSudoku().getGrid()[0][2]).toBe(0);
	});
});
