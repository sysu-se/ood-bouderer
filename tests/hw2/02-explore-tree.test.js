import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js';

describe('HW2 explore tree', () => {
	it('forks an explore branch independent of the parent branch', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 4 });

		const parentId = game.getCurrentBranchId();
		const childId = game.forkBranch();
		expect(childId).not.toBe(parentId);
		expect(game.getCurrentBranchId()).toBe(childId);

		// Child starts identical to parent at fork time.
		expect(game.getSudoku().getGrid()[0][2]).toBe(4);

		// Editing the child does not affect the parent.
		game.guess({ row: 0, col: 6, value: 1 });
		expect(game.getSudoku().getGrid()[0][6]).toBe(1);

		game.switchBranch(parentId);
		expect(game.getSudoku().getGrid()[0][6]).toBe(0);
		expect(game.getSudoku().getGrid()[0][2]).toBe(4);
	});

	it('reports parent/child structure via listBranches', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		const rootId = game.getCurrentBranchId();
		const childId = game.forkBranch();

		const branches = game.listBranches();
		expect(branches).toHaveLength(2);

		const root = branches.find((b) => b.id === rootId);
		const child = branches.find((b) => b.id === childId);

		expect(root.parentId).toBe('main');
		expect(root.depth).toBe(1);
		expect(child.parentId).toBe(rootId);
		expect(child.depth).toBe(2);
		expect(child.current).toBe(true);
		expect(root.current).toBe(false);
	});

	it('shares the failure memory across branches', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		const rootId = game.getCurrentBranchId();
		game.guess({ row: 0, col: 2, value: 5 });
		expect(game.getExploreFailure()).toMatchObject({ type: 'conflict', known: false });

		game.backtrackExplore();
		const siblingId = game.forkBranch();
		expect(siblingId).not.toBe(rootId);

		game.guess({ row: 0, col: 2, value: 5 });
		expect(game.getExploreFailure()).toMatchObject({ type: 'conflict', known: true });
	});

	it('commits the currently active branch and tears down the entire tree', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 4 });
		game.forkBranch();
		game.guess({ row: 0, col: 6, value: 1 });

		expect(game.commitExplore()).toBe(true);
		expect(game.isExploring()).toBe(false);
		expect(game.listBranches()).toHaveLength(0);

		const main = game.getMainSudoku().getGrid();
		expect(main[0][2]).toBe(4);
		expect(main[0][6]).toBe(1);
	});

	it('discards the entire tree and harvests every branch failure into shared memory', async () => {
		const { createGame, createSudoku } = await loadDomainApi();
		const game = createGame({ sudoku: createSudoku(makePuzzle()) });

		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 });
		game.forkBranch();
		// child has the same failing fingerprint inherited at fork time.

		game.discardExplore();
		expect(game.isExploring()).toBe(false);
		// At least the root branch's failure should now be in shared memory.
		expect(game.getFailedExplorations().length).toBeGreaterThanOrEqual(1);

		// Re-entering explore and walking back to that exact failed grid surfaces "known".
		game.startExplore();
		game.guess({ row: 0, col: 2, value: 5 });
		expect(game.getExploreFailure()).toMatchObject({ known: true });
	});
});
