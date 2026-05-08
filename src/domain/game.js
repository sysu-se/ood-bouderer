import {
	cloneGrid,
	cloneSudokuJSON,
	findContradiction,
	gridSignature,
	gridsEqual,
	normalizeGrid,
	normalizeMove,
} from './helpers.js';
import { createSudokuFromJSON } from './sudoku.js';

const MAIN_BRANCH_ID = 'main';

function assertSudoku(input) {
	if (!input || typeof input !== 'object') {
		throw new TypeError('createGame requires a Sudoku object');
	}

	if (
		typeof input.getGrid !== 'function' ||
		typeof input.clone !== 'function' ||
		typeof input.toJSON !== 'function'
	) {
		throw new TypeError('createGame requires a Sudoku object');
	}

	const json = input.toJSON();
	if (!json || json.kind !== 'Sudoku') {
		throw new TypeError('createGame requires a Sudoku object');
	}

	return input;
}

function cloneEntry(entry) {
	if (!entry || typeof entry !== 'object') {
		throw new TypeError('history entry must be an object');
	}

	const cloned = {
		type: entry.type || 'guess',
		before: cloneSudokuJSON(entry.before),
		after: cloneSudokuJSON(entry.after),
	};

	if (entry.move != null) {
		cloned.move = normalizeMove(entry.move);
	}

	if (Array.isArray(entry.moves)) {
		cloned.moves = entry.moves.map(normalizeMove);
	}

	return cloned;
}

function assertPreservesInitialGivens(initialGrid, sudokuJSON, label) {
	const grid = cloneSudokuJSON(sudokuJSON).grid;

	for (let row = 0; row < initialGrid.length; row++) {
		for (let col = 0; col < initialGrid[row].length; col++) {
			const given = initialGrid[row][col];
			if (given !== 0 && grid[row][col] !== given) {
				throw new TypeError(`${label} must preserve the initial givens`);
			}
		}
	}
}

function buildBranches(json) {
	const branches = new Map();

	const initialJSON = cloneSudokuJSON(
		json.initialSudoku || { kind: 'Sudoku', grid: cloneGrid(json.initialGrid) },
	);

	const mainJSON = json.currentSudoku ? cloneSudokuJSON(json.currentSudoku) : initialJSON;

	branches.set(MAIN_BRANCH_ID, {
		id: MAIN_BRANCH_ID,
		parentId: null,
		baseSudoku: cloneSudokuJSON(initialJSON),
		sudoku: createSudokuFromJSON(mainJSON),
		undoStack: (json.undoStack || []).map(cloneEntry),
		redoStack: (json.redoStack || []).map(cloneEntry),
	});

	let currentBranchId = MAIN_BRANCH_ID;

	if (json.exploreTree && Array.isArray(json.exploreTree.branches)) {
		for (const b of json.exploreTree.branches) {
			branches.set(b.id, {
				id: b.id,
				parentId: b.parentId,
				baseSudoku: cloneSudokuJSON(b.baseSudoku),
				sudoku: createSudokuFromJSON(b.currentSudoku),
				undoStack: (b.undoStack || []).map(cloneEntry),
				redoStack: (b.redoStack || []).map(cloneEntry),
			});
		}
		if (
			json.exploreTree.currentBranchId &&
			branches.has(json.exploreTree.currentBranchId)
		) {
			currentBranchId = json.exploreTree.currentBranchId;
		}
	} else if (json.explore && typeof json.explore === 'object') {
		// Backwards compatibility with the pre-tree single-branch format.
		const legacyId = 'branch-1';
		branches.set(legacyId, {
			id: legacyId,
			parentId: MAIN_BRANCH_ID,
			baseSudoku: cloneSudokuJSON(json.explore.baseSudoku),
			sudoku: createSudokuFromJSON(json.explore.currentSudoku ?? json.explore.baseSudoku),
			undoStack: (json.explore.undoStack || []).map(cloneEntry),
			redoStack: (json.explore.redoStack || []).map(cloneEntry),
		});
		currentBranchId = legacyId;
	}

	return { branches, currentBranchId };
}

class Game {
	constructor(json) {
		this._initialGrid = normalizeGrid(
			json.initialGrid || (json.initialSudoku && json.initialSudoku.grid),
			'Game initialGrid',
		);

		const { branches, currentBranchId } = buildBranches(json);
		this._branches = branches;
		this._currentBranchId = currentBranchId;

		this._failedSignatures = new Set((json.failedExplorations || []).map(String));

		this._assertRestoredStateIsConsistent();
	}

	getSudoku() {
		return this._activeBranch().sudoku.clone();
	}

	getMainSudoku() {
		return this._mainBranch().sudoku.clone();
	}

	getExploreSudoku() {
		return this.isExploring() ? this._activeBranch().sudoku.clone() : null;
	}

	getInitialGrid() {
		return cloneGrid(this._initialGrid);
	}

	getCandidates(position, col) {
		return this._activeBranch().sudoku.getCandidates(position, col);
	}

	getCandidateGrid() {
		return this._activeBranch().sudoku.getCandidateGrid();
	}

	getNextHint() {
		return this._activeBranch().sudoku.getNextHint();
	}

	peekNextHint() {
		return this._activeBranch().sudoku.peekNextHint();
	}

	applyHint() {
		const hint = this.getNextHint();
		if (!hint) {
			return false;
		}

		return this.guess(hint);
	}

	getConflictingCells() {
		return this._activeBranch().sudoku.getConflictingCells();
	}

	hasConflicts() {
		return this.getConflictingCells().length > 0;
	}

	isSolved() {
		return this._activeBranch().sudoku.isSolved();
	}

	guess(move) {
		const nextMove = normalizeMove(move);
		if (this._initialGrid[nextMove.row][nextMove.col] !== 0) {
			return false;
		}

		const branch = this._activeBranch();
		const currentGrid = branch.sudoku.getGrid();
		if (currentGrid[nextMove.row][nextMove.col] === nextMove.value) {
			return false;
		}

		const before = branch.sudoku.toJSON();
		branch.sudoku.guess(nextMove);
		branch.undoStack.push({
			type: 'guess',
			move: nextMove,
			before,
			after: branch.sudoku.toJSON(),
		});
		branch.redoStack.length = 0;

		return true;
	}

	undo() {
		const branch = this._activeBranch();
		if (branch.undoStack.length === 0) {
			return false;
		}

		const entry = branch.undoStack.pop();
		branch.redoStack.push(cloneEntry(entry));
		branch.sudoku = createSudokuFromJSON(entry.before);
		return true;
	}

	redo() {
		const branch = this._activeBranch();
		if (branch.redoStack.length === 0) {
			return false;
		}

		const entry = branch.redoStack.pop();
		branch.undoStack.push(cloneEntry(entry));
		branch.sudoku = createSudokuFromJSON(entry.after);
		return true;
	}

	canUndo() {
		return this._activeBranch().undoStack.length > 0;
	}

	canRedo() {
		return this._activeBranch().redoStack.length > 0;
	}

	isExploring() {
		return this._currentBranchId !== MAIN_BRANCH_ID;
	}

	startExplore() {
		if (this.isExploring()) {
			return false;
		}

		const main = this._mainBranch();
		const id = this._nextBranchId();
		this._branches.set(id, {
			id,
			parentId: MAIN_BRANCH_ID,
			baseSudoku: main.sudoku.toJSON(),
			sudoku: main.sudoku.clone(),
			undoStack: [],
			redoStack: [],
		});
		this._currentBranchId = id;
		return true;
	}

	forkBranch() {
		if (!this.isExploring()) {
			return false;
		}

		const parent = this._activeBranch();
		this._rememberFailureIfAny(parent);

		const id = this._nextBranchId();
		this._branches.set(id, {
			id,
			parentId: parent.id,
			baseSudoku: parent.sudoku.toJSON(),
			sudoku: parent.sudoku.clone(),
			undoStack: [],
			redoStack: [],
		});
		this._currentBranchId = id;
		return id;
	}

	switchBranch(id) {
		if (id === MAIN_BRANCH_ID) {
			return false;
		}
		if (!this._branches.has(id)) {
			return false;
		}

		this._rememberFailureIfAny(this._activeBranch());
		this._currentBranchId = id;
		return true;
	}

	listBranches() {
		const result = [];
		for (const branch of this._branches.values()) {
			if (branch.id === MAIN_BRANCH_ID) continue;
			const grid = branch.sudoku.getGrid();
			const fingerprint = gridSignature(grid);
			result.push({
				id: branch.id,
				parentId: branch.parentId,
				depth: this._branchDepth(branch),
				fingerprint,
				failed:
					!!findContradiction(grid) || this._failedSignatures.has(fingerprint),
				current: branch.id === this._currentBranchId,
			});
		}
		return result;
	}

	getCurrentBranchId() {
		return this._currentBranchId;
	}

	commitExplore() {
		if (!this.isExploring() || this.isExploreFailed()) {
			return false;
		}

		const main = this._mainBranch();
		const branch = this._activeBranch();
		const before = main.sudoku.toJSON();
		const after = branch.sudoku.toJSON();
		const exploreMoves = branch.undoStack
			.map((entry) => entry.move)
			.filter(Boolean)
			.map(normalizeMove);

		if (!gridsEqual(before.grid, after.grid)) {
			main.sudoku = createSudokuFromJSON(after);
			main.undoStack.push({
				type: 'explore-commit',
				moves: exploreMoves,
				before,
				after,
			});
			main.redoStack = [];
		}

		this._dropExploreTree();
		return true;
	}

	discardExplore() {
		if (!this.isExploring()) {
			return false;
		}

		this._rememberAllExploreFailures();
		this._dropExploreTree();
		return true;
	}

	backtrackExplore() {
		if (!this.isExploring()) {
			return false;
		}

		const branch = this._activeBranch();
		this._rememberFailureIfAny(branch);
		branch.sudoku = createSudokuFromJSON(branch.baseSudoku);
		branch.undoStack = [];
		branch.redoStack = [];
		return true;
	}

	getExploreFailure() {
		if (!this.isExploring()) {
			return null;
		}

		const grid = this._activeBranch().sudoku.getGrid();
		const signature = gridSignature(grid);
		const known = this._failedSignatures.has(signature);
		const contradiction = findContradiction(grid);

		if (contradiction) {
			return {
				...contradiction,
				signature,
				known,
			};
		}

		if (known) {
			return {
				type: 'known-failed',
				signature,
				known: true,
				reason: 'This exploration state was already marked as failed.',
			};
		}

		return null;
	}

	isExploreFailed() {
		return this.getExploreFailure() != null;
	}

	getFailedExplorations() {
		return Array.from(this._failedSignatures);
	}

	toJSON() {
		const main = this._mainBranch();
		return {
			kind: 'Game',
			initialSudoku: {
				kind: 'Sudoku',
				grid: cloneGrid(this._initialGrid),
			},
			currentSudoku: main.sudoku.toJSON(),
			undoStack: main.undoStack.map(cloneEntry),
			redoStack: main.redoStack.map(cloneEntry),
			exploreTree: this.isExploring() ? this._serializeExploreTree() : null,
			failedExplorations: this.getFailedExplorations(),
		};
	}

	toString() {
		const branch = this._activeBranch();
		const mode = this.isExploring() ? `explore:${branch.id}` : 'main';
		return `Game(mode=${mode}, undo=${branch.undoStack.length}, redo=${branch.redoStack.length})\n${branch.sudoku.toString()}`;
	}

	_activeBranch() {
		return this._branches.get(this._currentBranchId);
	}

	_mainBranch() {
		return this._branches.get(MAIN_BRANCH_ID);
	}

	_branchDepth(branch) {
		let depth = 0;
		let cursor = branch;
		while (cursor && cursor.parentId !== null) {
			depth += 1;
			cursor = this._branches.get(cursor.parentId);
		}
		return depth;
	}

	_nextBranchId() {
		let max = 0;
		for (const id of this._branches.keys()) {
			const match = /^branch-(\d+)$/.exec(id);
			if (match) {
				max = Math.max(max, Number(match[1]));
			}
		}
		return `branch-${max + 1}`;
	}

	_rememberFailureIfAny(branch) {
		const grid = branch.sudoku.getGrid();
		if (findContradiction(grid)) {
			this._failedSignatures.add(gridSignature(grid));
		}
	}

	_rememberAllExploreFailures() {
		for (const branch of this._branches.values()) {
			if (branch.id === MAIN_BRANCH_ID) continue;
			this._rememberFailureIfAny(branch);
		}
	}

	_dropExploreTree() {
		for (const id of Array.from(this._branches.keys())) {
			if (id !== MAIN_BRANCH_ID) {
				this._branches.delete(id);
			}
		}
		this._currentBranchId = MAIN_BRANCH_ID;
	}

	_serializeExploreTree() {
		const branches = [];
		for (const branch of this._branches.values()) {
			if (branch.id === MAIN_BRANCH_ID) continue;
			branches.push({
				id: branch.id,
				parentId: branch.parentId,
				baseSudoku: cloneSudokuJSON(branch.baseSudoku),
				currentSudoku: branch.sudoku.toJSON(),
				undoStack: branch.undoStack.map(cloneEntry),
				redoStack: branch.redoStack.map(cloneEntry),
			});
		}
		return {
			currentBranchId: this._currentBranchId,
			branches,
		};
	}

	_assertRestoredStateIsConsistent() {
		for (const branch of this._branches.values()) {
			const label = branch.id === MAIN_BRANCH_ID ? 'main' : `branch ${branch.id}`;
			assertPreservesInitialGivens(
				this._initialGrid,
				branch.sudoku.toJSON(),
				`${label} sudoku`,
			);
			assertPreservesInitialGivens(
				this._initialGrid,
				branch.baseSudoku,
				`${label} baseSudoku`,
			);
			for (const entry of [...branch.undoStack, ...branch.redoStack]) {
				assertPreservesInitialGivens(
					this._initialGrid,
					entry.before,
					`${label} history entry.before`,
				);
				assertPreservesInitialGivens(
					this._initialGrid,
					entry.after,
					`${label} history entry.after`,
				);
			}
		}
	}
}

export function createGame({ sudoku }) {
	const normalizedSudoku = assertSudoku(sudoku);
	return new Game({
		initialGrid: normalizedSudoku.getGrid(),
		currentSudoku: normalizedSudoku.toJSON(),
	});
}

export function createGameFromJSON(json) {
	if (!json || typeof json !== 'object') {
		throw new TypeError('game json must be an object');
	}

	if (json.kind != null && json.kind !== 'Game') {
		throw new TypeError('game json kind must be "Game"');
	}

	return new Game(json);
}
