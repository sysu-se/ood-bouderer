import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js';

function makeHiddenSinglePuzzle() {
	// Row 0 is the only row that anchors enough digits to force a hint.
	// Digit 1 in row 0 can only land at (0, 0): col 3 already has 1 (row 1) and
	// col 6 already has 1 (row 2), so cells (0, 3) and (0, 6) cannot take 1.
	// Cell (0, 0) still has 3 candidates {1, 8, 9}, so naked-single never fires.
	return [
		[0, 2, 3, 0, 4, 5, 0, 6, 7],
		[0, 0, 0, 1, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 1, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
}

describe('HW2 hint strategies', () => {
	it('reports naked-single strategy and a non-empty reason', async () => {
		const { createSudoku } = await loadDomainApi();
		const sudoku = createSudoku(makePuzzle());

		const hint = sudoku.getNextHint();
		expect(hint).toMatchObject({ strategy: 'naked-single', row: 4, col: 4, value: 5 });
		expect(typeof hint.reason).toBe('string');
		expect(hint.reason.length).toBeGreaterThan(0);
		expect(hint.candidates).toEqual([5]);
	});

	it('falls back to hidden-single-row when no naked single is available', async () => {
		const { createSudoku } = await loadDomainApi();
		const sudoku = createSudoku(makeHiddenSinglePuzzle());

		const hint = sudoku.getNextHint();
		expect(hint).toMatchObject({
			strategy: 'hidden-single-row',
			row: 0,
			col: 0,
			value: 1,
		});
		expect(hint.candidates).toContain(1);
		expect(hint.candidates.length).toBeGreaterThan(1);
	});

	it('peekNextHint returns position and reason without leaking the answer', async () => {
		const { createSudoku } = await loadDomainApi();
		const sudoku = createSudoku(makePuzzle());

		const peek = sudoku.peekNextHint();
		expect(peek).toMatchObject({ row: 4, col: 4, strategy: 'naked-single' });
		expect(peek).not.toHaveProperty('value');
		expect(typeof peek.reason).toBe('string');
		expect(peek.reason.length).toBeGreaterThan(0);
	});

	it('returns null when no progress can be deduced', async () => {
		const { createSudoku } = await loadDomainApi();
		const sudoku = createSudoku(Array.from({ length: 9 }, () => Array(9).fill(0)));

		// An empty board has many candidates everywhere — no naked or hidden single fires.
		expect(sudoku.getNextHint()).toBe(null);
		expect(sudoku.peekNextHint()).toBe(null);
	});

	it('Game.peekNextHint and applyHint operate on the active branch', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		const peek = game.peekNextHint();
		expect(peek).toMatchObject({ row: 4, col: 4 });
		expect(peek).not.toHaveProperty('value');

		expect(game.applyHint()).toBe(true);
		expect(game.getMainSudoku().getGrid()[4][4]).toBe(5);
	});
});
