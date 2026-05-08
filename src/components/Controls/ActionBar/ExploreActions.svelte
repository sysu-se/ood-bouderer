<script>
	import { gameSession, exploreFailure, isExploring, exploreBranches, currentBranchId } from '@sudoku/stores/gameSession';
	import { gamePaused } from '@sudoku/stores/game';
</script>

<div class="explore-row">
	{#if !$isExploring}
		<button class="btn btn-small" disabled={$gamePaused} on:click={gameSession.startExplore}>
			Explore
		</button>
	{:else}
		<button class="btn btn-small btn-primary" disabled={$gamePaused || $exploreFailure} on:click={gameSession.commitExplore}>
			Commit
		</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={gameSession.forkBranch} title="Fork a new branch from current state">
			Fork
		</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={gameSession.backtrackExplore} title="Reset to start of exploration">
			Reset
		</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={gameSession.discardExplore}>
			Discard
		</button>
	{/if}
</div>

{#if $isExploring && $exploreBranches.length > 0}
	<div class="branch-list">
		{#each $exploreBranches as branch (branch.id)}
			<button
				class="btn btn-tiny"
				class:btn-active={branch.current}
				class:btn-failed={branch.failed}
				disabled={branch.current}
				on:click={() => gameSession.switchBranch(branch.id)}
				title="Depth: {branch.depth}{branch.failed ? ' (failed)' : ''}"
			>
				{branch.id}{branch.failed ? ' ✗' : ''}
			</button>
		{/each}
	</div>
{/if}

{#if $isExploring && $exploreFailure}
	<div class="failure-banner" class:known={$exploreFailure.known}>
		{$exploreFailure.reason}
		{#if $exploreFailure.known}
			<span class="known-tag">previously failed</span>
		{/if}
	</div>
{:else if $isExploring}
	<div class="explore-banner">Exploring — main board is frozen.</div>
{/if}

<style>
	.explore-row {
		@apply flex flex-wrap gap-2 pb-3;
	}

	.branch-list {
		@apply flex flex-wrap gap-1 pb-2;
	}

	.btn-tiny {
		@apply px-2 py-1 text-xs rounded bg-gray-200 text-gray-700;
	}

	.btn-tiny.btn-active {
		@apply bg-blue-500 text-white;
	}

	.btn-tiny.btn-failed {
		@apply bg-red-200 text-red-700;
	}

	.failure-banner {
		@apply px-3 py-2 mb-3 rounded text-sm bg-red-100 text-red-800 border border-red-300;
	}

	.failure-banner.known {
		@apply bg-orange-100 text-orange-800 border-orange-300;
	}

	.known-tag {
		@apply ml-2 px-2 rounded bg-orange-300 text-xs font-semibold;
		padding-top: 2px;
		padding-bottom: 2px;
	}

	.explore-banner {
		@apply px-3 py-2 mb-3 rounded text-sm bg-blue-100 text-blue-800 border border-blue-300;
	}
</style>
