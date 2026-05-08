export const SUDOKU_SIZE = 9;
export const BOX_SIZE = 3;
export const DIGITS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

export function cloneGrid(grid) {
	return grid.map((row) => row.slice());
}

function normalizeInteger(value, label) {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!/^[-]?\d+$/.test(trimmed)) {
			throw new TypeError(`${label} must be an integer string`);
		}
		value = Number(trimmed);
	}

	if (!Number.isInteger(value)) {
		throw new TypeError(`${label} must be an integer`);
	}

	return value;
}

export function normalizeCellValue(value, label = 'cell value') {
	if (value == null || value === '') {
		return 0;
	}

	const normalized = normalizeInteger(value, label);
	if (normalized < 0 || normalized > 9) {
		throw new RangeError(`${label} must be between 0 and 9`);
	}

	return normalized;
}

export function normalizeIndex(value, label = 'index') {
	const normalized = normalizeInteger(value, label);
	if (normalized < 0 || normalized >= SUDOKU_SIZE) {
		throw new RangeError(`${label} must be between 0 and ${SUDOKU_SIZE - 1}`);
	}

	return normalized;
}

export function normalizePosition(position, col) {
	let rowValue;
	let colValue;

	if (position && typeof position === 'object') {
		rowValue = position.row ?? position.r;
		colValue = position.col ?? position.column ?? position.c;
	} else {
		rowValue = position;
		colValue = col;
	}

	return {
		row: normalizeIndex(rowValue, 'position.row'),
		col: normalizeIndex(colValue, 'position.col'),
	};
}

export function normalizeMove(move) {
	if (!move || typeof move !== 'object') {
		throw new TypeError('move must be an object');
	}

	return {
		...normalizePosition(move),
		value: normalizeCellValue(move.value ?? move.digit ?? move.number, 'move.value'),
	};
}

export function normalizeGrid(grid, label = 'grid') {
	if (!Array.isArray(grid) || grid.length !== SUDOKU_SIZE) {
		throw new TypeError(`${label} must be a ${SUDOKU_SIZE}x${SUDOKU_SIZE} array`);
	}

	return grid.map((row, rowIndex) => {
		if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
			throw new TypeError(`${label}[${rowIndex}] must contain ${SUDOKU_SIZE} cells`);
		}

		return row.map((value, colIndex) =>
			normalizeCellValue(value, `${label}[${rowIndex}][${colIndex}]`),
		);
	});
}

export function normalizeSudokuJSON(json) {
	if (Array.isArray(json)) {
		return {
			kind: 'Sudoku',
			grid: normalizeGrid(json, 'sudoku json'),
		};
	}

	if (!json || typeof json !== 'object') {
		throw new TypeError('sudoku json must be an object or 9x9 array');
	}

	if (json.kind != null && json.kind !== 'Sudoku') {
		throw new TypeError('sudoku json kind must be "Sudoku"');
	}

	return {
		kind: 'Sudoku',
		grid: normalizeGrid(json.grid, 'sudoku json.grid'),
	};
}

export function cloneSudokuJSON(json) {
	const data = normalizeSudokuJSON(json);
	return {
		kind: data.kind,
		grid: cloneGrid(data.grid),
	};
}

export function collectConflicts(grid) {
	const conflicts = new Set();

	const markUnit = (cells) => {
		const seen = new Map();

		for (const cell of cells) {
			if (cell.value === 0) {
				continue;
			}

			if (!seen.has(cell.value)) {
				seen.set(cell.value, [cell]);
				continue;
			}

			for (const conflict of seen.get(cell.value)) {
				conflicts.add(`${conflict.row},${conflict.col}`);
			}
			conflicts.add(`${cell.row},${cell.col}`);
			seen.get(cell.value).push(cell);
		}
	};

	for (let row = 0; row < SUDOKU_SIZE; row++) {
		markUnit(grid[row].map((value, col) => ({ row, col, value })));
	}

	for (let col = 0; col < SUDOKU_SIZE; col++) {
		markUnit(grid.map((row, rowIndex) => ({ row: rowIndex, col, value: row[col] })));
	}

	for (let startRow = 0; startRow < SUDOKU_SIZE; startRow += BOX_SIZE) {
		for (let startCol = 0; startCol < SUDOKU_SIZE; startCol += BOX_SIZE) {
			const box = [];
			for (let row = startRow; row < startRow + BOX_SIZE; row++) {
				for (let col = startCol; col < startCol + BOX_SIZE; col++) {
					box.push({ row, col, value: grid[row][col] });
				}
			}
			markUnit(box);
		}
	}

	return Array.from(conflicts).map((key) => {
		const [row, col] = key.split(',').map(Number);
		return { row, col };
	});
}

export function isComplete(grid) {
	return grid.every((row) => row.every((value) => value !== 0));
}

export function getCandidateValues(grid, position, col) {
	const { row, col: normalizedCol } = normalizePosition(position, col);
	if (grid[row][normalizedCol] !== 0) {
		return [];
	}

	const used = new Set();
	for (let index = 0; index < SUDOKU_SIZE; index++) {
		used.add(grid[row][index]);
		used.add(grid[index][normalizedCol]);
	}

	const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
	const boxCol = Math.floor(normalizedCol / BOX_SIZE) * BOX_SIZE;
	for (let r = boxRow; r < boxRow + BOX_SIZE; r++) {
		for (let c = boxCol; c < boxCol + BOX_SIZE; c++) {
			used.add(grid[r][c]);
		}
	}

	used.delete(0);
	return DIGITS.filter((value) => !used.has(value));
}

export function getCandidateGrid(grid) {
	return grid.map((row, rowIndex) =>
		row.map((_, colIndex) => getCandidateValues(grid, { row: rowIndex, col: colIndex })),
	);
}

function findNakedSingle(grid) {
	for (let row = 0; row < SUDOKU_SIZE; row++) {
		for (let col = 0; col < SUDOKU_SIZE; col++) {
			const candidates = getCandidateValues(grid, { row, col });
			if (candidates.length === 1) {
				const value = candidates[0];
				return {
					type: 'single-candidate',
					strategy: 'naked-single',
					row,
					col,
					value,
					candidates,
					reason: `Cell (row ${row + 1}, col ${col + 1}) only allows ${value}; every other digit is already used in its row, column, or box.`,
				};
			}
		}
	}

	return null;
}

function unitCells(unit, grid) {
	if (unit.kind === 'row') {
		return Array.from({ length: SUDOKU_SIZE }, (_, c) => ({ row: unit.index, col: c }));
	}
	if (unit.kind === 'col') {
		return Array.from({ length: SUDOKU_SIZE }, (_, r) => ({ row: r, col: unit.index }));
	}
	const startRow = Math.floor(unit.index / BOX_SIZE) * BOX_SIZE;
	const startCol = (unit.index % BOX_SIZE) * BOX_SIZE;
	const cells = [];
	for (let r = startRow; r < startRow + BOX_SIZE; r++) {
		for (let c = startCol; c < startCol + BOX_SIZE; c++) {
			cells.push({ row: r, col: c });
		}
	}
	return cells;
}

function findHiddenSingleInUnit(grid, unit) {
	const cells = unitCells(unit, grid);
	const used = new Set();
	const empties = [];

	for (const { row, col } of cells) {
		const value = grid[row][col];
		if (value === 0) {
			empties.push({ row, col, candidates: getCandidateValues(grid, { row, col }) });
		} else {
			used.add(value);
		}
	}

	for (const digit of DIGITS) {
		if (used.has(digit)) continue;
		const fits = empties.filter((cell) => cell.candidates.includes(digit));
		if (fits.length === 1) {
			const cell = fits[0];
			return {
				type: 'hidden-single',
				strategy: `hidden-single-${unit.kind}`,
				row: cell.row,
				col: cell.col,
				value: digit,
				candidates: cell.candidates,
				reason: `Digit ${digit} can only go in (row ${cell.row + 1}, col ${cell.col + 1}) within this ${unit.kind === 'box' ? 'box' : unit.kind};` +
					` every other empty cell in the ${unit.kind === 'box' ? 'box' : unit.kind} already excludes ${digit}.`,
			};
		}
	}

	return null;
}

function findHiddenSingle(grid, kind) {
	for (let index = 0; index < SUDOKU_SIZE; index++) {
		const hit = findHiddenSingleInUnit(grid, { kind, index });
		if (hit) return hit;
	}
	return null;
}

export function findNextHint(grid) {
	const naked = findNakedSingle(grid);
	if (naked) return naked;

	for (const kind of ['row', 'col', 'box']) {
		const hit = findHiddenSingle(grid, kind);
		if (hit) return hit;
	}

	return null;
}

export function findContradiction(grid) {
	const conflicts = collectConflicts(grid);
	if (conflicts.length > 0) {
		return {
			type: 'conflict',
			conflicts,
			reason: 'The board contains duplicated values in a row, column, or box.',
		};
	}

	for (let row = 0; row < SUDOKU_SIZE; row++) {
		for (let col = 0; col < SUDOKU_SIZE; col++) {
			if (grid[row][col] === 0 && getCandidateValues(grid, { row, col }).length === 0) {
				return {
					type: 'dead-end',
					row,
					col,
					candidates: [],
					reason: `No value can fit at row ${row + 1}, column ${col + 1}.`,
				};
			}
		}
	}

	return null;
}

export function gridSignature(grid) {
	return grid.map((row) => row.join('')).join('/');
}

export function gridsEqual(left, right) {
	return gridSignature(left) === gridSignature(right);
}
