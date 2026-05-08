<script>
	import Timer from './Timer.svelte';
	import Actions from './Actions.svelte';
	import ExploreActions from './ExploreActions.svelte';
</script>

<div class="action-bar space-y-3 xs:space-y-0">
	<Timer />

	<Actions />
</div>

<ExploreActions />

<style>
	.action-bar {
		@apply flex flex-col flex-wrap justify-between pb-5;
	}

	@screen xs {
		.action-bar {
			@apply flex-row;
		}
	}
</style>