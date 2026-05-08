import {
	SUDOKU_SIZE,
	cloneGrid,
	cloneSudokuJSON,
	collectConflicts,
	findContradiction,
	findNextHint,
	getCandidateGrid,
	getCandidateValues,
	isComplete,
	normalizeGrid,
	normalizeMove,
	normalizeSudokuJSON,
} from './helpers.js';

class Sudoku {
	constructor(grid) {
		this._grid = normalizeGrid(grid, 'Sudoku grid');
	}

	getGrid() {
		return cloneGrid(this._grid);
	}

	guess(move) {
		const nextMove = normalizeMove(move);
		this._grid[nextMove.row][nextMove.col] = nextMove.value;
		return this;
	}

	clone() {
		return new Sudoku(this._grid);
	}

	getCandidates(position, col) {
		return getCandidateValues(this._grid, position, col);
	}

	getCandidateGrid() {
		return getCandidateGrid(this._grid);
	}

	getNextHint() {
		return findNextHint(this._grid);
	}

	peekNextHint() {
		const hint = this.getNextHint();
		if (!hint) {
			return null;
		}

		return {
			type: hint.type,
			strategy: hint.strategy,
			row: hint.row,
			col: hint.col,
			candidates: hint.candidates,
			reason: hint.reason,
		};
	}

	getConflictingCells() {
		return collectConflicts(this._grid);
	}

	hasConflicts() {
		return this.getConflictingCells().length > 0;
	}

	getContradiction() {
		return findContradiction(this._grid);
	}

	isComplete() {
		return isComplete(this._grid);
	}

	isSolved() {
		return this.isComplete() && !this.hasConflicts();
	}

	toJSON() {
		return cloneSudokuJSON({ kind: 'Sudoku', grid: this._grid });
	}

	toString() {
		const lines = [];

		for (let row = 0; row < SUDOKU_SIZE; row++) {
			if (row !== 0 && row % 3 === 0) {
				lines.push('------+-------+------');
			}

			const values = [];
			for (let col = 0; col < SUDOKU_SIZE; col++) {
				if (col !== 0 && col % 3 === 0) {
					values.push('|');
				}
				values.push(this._grid[row][col] === 0 ? '.' : String(this._grid[row][col]));
			}

			lines.push(values.join(' '));
		}

		return lines.join('\n');
	}
}

export function createSudoku(input) {
	return new Sudoku(input);
}

export function createSudokuFromJSON(json) {
	return new Sudoku(normalizeSudokuJSON(json).grid);
}
