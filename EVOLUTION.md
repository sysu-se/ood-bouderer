# EVOLUTION

## 1. 提示功能如何实现

提示能力放在领域对象中，而不是在 Svelte 组件里临时拼接。

`Sudoku` 暴露三组提示相关接口：

- `getCandidates(position)` / `getCandidateGrid()`：返回某格 / 整盘的候选值集合，由当前棋盘的行、列、宫约束共同决定。
- `getNextHint()`：扫描整盘，先尝试 **naked single**（某格只剩一个候选值），再尝试 **hidden single**（某行 / 列 / 宫里某个数字只能放在一格）。返回结构包含 `strategy`、`row`、`col`、`value`、`candidates` 和 `reason`。
- `peekNextHint()`：与 `getNextHint()` 同源，但**不返回 `value`**，只暴露 `row` / `col` / `strategy` / `reason`。这把“仅提示位置”和“直接填写答案”两档明确分开。

当前实现支持的提示策略：

- `naked-single`
- `hidden-single-row`
- `hidden-single-col`
- `hidden-single-box`

UI 不直接计算候选数或下一步，而是通过 `gameSession` 访问领域对象：

- 仅提示位置：`gameSession.peekHint()`，返回位置和解释，不泄露答案值。
- 直接填写答案：`gameSession.applyHint()`，内部读取当前 `Game` 的下一步提示，然后通过 `guess` 写入当前活动局面，并消耗一次 hint 次数。

`Game` 自身也提供 `getNextHint()`、`peekNextHint()` 和 `applyHint()`，这些方法都会作用在**当前活动分支**上：普通模式下是主分支，探索模式下是当前探索分支。

## 2. 提示功能属于 Sudoku 还是 Game

提示规则本身更属于 `Sudoku`，因为候选值、naked single、hidden single 都只依赖当前棋盘的数字分布。`Sudoku` 不需要知道 undo、redo、探索分支或 UI 状态，因此它适合承担“规则计算器”的角色。

`Game` 负责会话语义：

- 决定当前应该对主分支还是探索分支求提示。
- 把“应用提示”纳入历史记录。
- 保证提示填写不能覆盖初始题面 givens。

因此二者的关系是：

- `Sudoku` 负责纯规则计算。
- `Game` 负责把规则应用到当前会话状态。
- UI 只调用 `Game` 的包装 store，不重复实现规则。

## 3. 探索模式如何实现

探索模式被建模为 `Game` 内部的一棵临时分支树。

### 内部状态

所有局面都统一表示为同形状的 `Branch`：

```text
{ id, parentId, baseSudoku, sudoku, undoStack, redoStack }
```

主分支 id 固定为 `main`，`parentId = null`。所有分支放在 `_branches: Map<string, Branch>` 中，当前活动局面由 `_currentBranchId` 指向。`isExploring()` 等价于 `_currentBranchId !== 'main'`。

这样主局面和探索局面不再是两套特殊字段，而是同一种对象结构。Undo / Redo、候选提示、冲突检查都可以统一作用于“当前活动分支”。

### 为什么选择 Branch，而不是只保存一个 explore snapshot

最简单的 Explore 实现是保存一个 `exploreSnapshot`：进入探索时复制主棋盘，失败时回滚到这个快照，提交时覆盖主棋盘。这个方案能完成最小功能，但它隐含了“探索只有一条临时路线”的假设。

本次选择 `Branch` 是因为 HW2 的功能会自然把探索从“一条路线”推向“多条路线”：

- 探索需要独立 Undo / Redo，所以临时局面不能只有一个棋盘，还需要自己的 history。
- 加分项要求树状探索分支，所以一个 snapshot 无法表达父子分支关系。
- 失败记忆需要比较不同路径是否到达过同一个失败棋盘，分支需要有自己的当前棋盘和身份。
- 主局面和探索局面应该用同一种结构，否则代码会出现大量“如果是主局面就这样，如果是探索局面就那样”的分支判断。

因此 `Branch` 不是为了提前复杂化，而是把“一个可操作局面”抽象出来：它有棋盘、有进入该局面的基准快照、有自己的 undo / redo。主分支只是一个特殊 id 的 Branch，探索分支也是 Branch。这样设计后，新增 fork、switch、commit 都是围绕 Branch 操作，而不是继续往 `Game` 里塞临时字段。

### 操作语义

- `startExplore()`：从主分支当前棋盘创建探索根分支，并切换到它。
- `forkBranch()`：从当前探索分支的当前棋盘创建子分支，并切换到新分支。
- `switchBranch(id)`：切换到某个已有探索分支。
- `listBranches()`：返回探索树概览，包括分支 id、父分支、深度、棋盘签名、是否失败、是否当前分支。
- `backtrackExplore()`：当前分支回到自己的 `baseSudoku`，并清空该分支的 undo / redo。
- `commitExplore()`：把当前探索分支提交到主分支，写入一条 `type: 'explore-commit'` 的主历史记录，然后销毁整棵探索树。
- `discardExplore()`：放弃探索，销毁整棵探索树，主分支保持不变。
- `getExploreFailure()`：只查询当前分支是否失败，不修改内部状态。

UI 当前也接入了探索能力：可以进入探索、提交、放弃、回到探索起点，也可以 fork 分支并在分支间切换。树状分支的主要价值仍然体现在领域层和测试中，UI 只是提供了一个轻量入口。

### 探索失败与记忆

探索失败有两类：

1. `conflict`：行、列或宫里出现重复数字。
2. `dead-end`：某个空格没有任何候选值可填。

失败记忆由 `_failedSignatures: Set<string>` 保存。`gridSignature(grid)` 把棋盘转成字符串作为 key。这个集合属于整个 `Game`，不属于某个分支，所以不同探索分支之间共享失败记忆。

失败记忆放在 `Game` 级别，而不是 `Branch` 级别，是一个有意选择。因为作业里的“记忆”关注的是：用户是否已经证明过**某个棋盘状态**走不通，而不是某个具体分支是否失败。不同分支可能通过不同操作到达同一个棋盘，如果失败签名只存在各自 Branch 内，切到另一条路径时就无法提示“这个状态之前已经失败过”。把失败记忆放在 `Game` 上，相当于给整个探索会话提供一份共享的“死路地图”。

这个选择也有代价：失败记忆不再记录完整路径，只记录棋盘签名。所以系统能判断“这个棋盘状态失败过”，但不能解释“当时是从哪条路径走到这里的”。我认为这个取舍适合本次作业，因为要求是提示用户已失败路径，而不是可视化完整搜索证明。

当前设计把“查询失败”和“登记失败”分开：

- `getExploreFailure()`：只判断当前分支是否失败，或是否命中已知失败签名；它不写入 `_failedSignatures`。
- `_rememberFailureIfAny(branch)`：如果某个分支当前已经失败，则显式登记它的棋盘签名。
- `_rememberAllExploreFailures()`：遍历所有探索分支，登记其中失败的棋盘签名。

登记发生在会改变探索路径的动作中，例如 `forkBranch()`、`switchBranch()`、`backtrackExplore()` 和 `discardExplore()`。这样可以避免“只是查询一下，内部状态却被改变”的隐式副作用。

## 4. 主局面与探索局面的关系

主局面和探索局面是复制关系，不共享同一个 `Sudoku` 实例。

进入探索或创建分支时，当前棋盘会通过 `toJSON()` / `createSudokuFromJSON()` 或 `clone()` 复制。这样探索中的填写不会污染主分支，也不会污染兄弟分支。

具体关系如下：

- 主分支：真实游戏进度，保存主线 undo / redo。
- 探索分支：临时试错局面，保存自己的 undo / redo。
- 提交探索：当前探索分支的棋盘整体替换主分支棋盘，并写入一条主历史记录。
- 放弃探索：直接销毁探索树，主分支不变。
- 回到起点：只影响当前探索分支，主分支和其他分支不变。

深拷贝问题可控，因为 `Sudoku` 内部状态只是一个 9×9 数字数组；`cloneGrid` 会复制每一行，不会产生共享引用污染。

反序列化时会执行 `assertPreservesInitialGivens`，检查主分支、探索分支、以及所有历史快照都没有篡改初始题面 givens。这保证了序列化数据即使被手动修改，也不会破坏游戏不变量。

## 5. history 结构是否变化

发生了变化，但主历史仍保持线性。

HW1 中，history 主要表示单步猜测：

```text
{ type: 'guess', move, before, after }
```

HW2 中增加了探索提交记录：

```text
{ type: 'explore-commit', moves, before, after }
```

探索期间，每个分支都有自己的 `undoStack` 和 `redoStack`，因此探索内 Undo / Redo 与主分支 Undo / Redo 相互独立。

`commitExplore()` 时，探索树不会原样合并进主历史，而是坍缩为一条 `explore-commit`。这样主 history 仍然是线性栈：主线用户只看到“一次探索提交”，而不需要理解探索树内部经过了多少次 fork、undo 或 redo。

这里没有把主 history 也设计成树，是因为主 history 的职责和探索树不同。主 history 服务的是普通 Undo / Redo：用户按一次 Undo，就应该回到上一个主局面。如果把主 history 也变成树，那么普通 Undo / Redo 就需要回答“退回哪个父节点”“Redo 到哪个分支”“提交后兄弟分支是否还存在”等问题，这会把本次作业推向 DAG 合并或版本控制系统的复杂度。

所以我把复杂性限制在探索期间：探索内部可以 fork，主线仍保持线性。提交探索时，把当前分支的结果压缩成一条 `explore-commit`，既保留“这是一次探索式改动”的语义，又不破坏 HW1 已经建立的线性 history 模型。

因此整体结构是：

- 对外：主历史仍是线性的 undo / redo 栈。
- 对内：探索期间临时存在树状分支。
- 提交时：树状过程坍缩成主历史里的一条记录。
- 放弃时：探索树直接丢弃，不进入主历史。

## 6. Homework 1 设计暴露出的局限

HW1 的对象设计在只有普通填写、Undo / Redo 时足够使用，但 HW2 暴露出几个局限。

### 1. “一个 Game 只有一个棋盘”的假设不够

探索模式要求同时存在主局面和临时试错局面。进一步支持树状探索后，还会出现多个探索分支。若继续用 `_sudoku`、`_exploreSudoku`、`_undoStack`、`_exploreUndoStack` 这类散字段，代码会快速膨胀。

本次改成 `Branch` 后，主分支和探索分支同形状，新增分支不需要新增一组字段。

### 2. History entry 只表达单步操作不够

HW1 的 history 可以只记录单步 `guess`。HW2 中探索提交可能包含多步尝试，甚至经历过 undo / redo / fork。最终提交到主历史时，如果仍按单步记录，会丢失“这是一段探索结果”的语义。

因此 history entry 加了 `type` 字段，并允许 `explore-commit` 使用整体 `before / after` 快照表达批量提交。

### 3. API 别名会显著降低可读性

早期为了兼容多种叫法，曾经出现多个同义方法。这样虽然调用方便，但会污染补全，也会让 reviewer 不知道哪个才是推荐用法。

当前版本保留单一权威名，例如：

- `startExplore`
- `forkBranch`
- `switchBranch`
- `commitExplore`
- `discardExplore`
- `backtrackExplore`
- `getExploreFailure`

### 4. 查询和命令需要分开

探索失败记忆最初容易写成“查询时顺便登记”。这会让 `getExploreFailure()` 这种看似只读的方法改变内部状态。当前版本把它拆开：查询方法只查询，登记失败由明确改变探索路径的方法负责。

## 7. 如果重做 Homework 1 会如何修改

如果重做 HW1，我会从一开始就把 `Game` 设计成“管理分支的会话对象”，即使当时只有主分支。

具体会这样设计：

- `Sudoku` 只负责棋盘规则：候选、冲突、完成状态、序列化。
- `Game` 持有 `Map<id, Branch>` 和 `currentBranchId`。
- 主分支固定为 `main`。
- 每个分支都有自己的 `sudoku`、`undoStack`、`redoStack`。
- history entry 从一开始就带 `type` 字段。
- 公共 API 只保留一个权威名字，不写同义别名。
- 反序列化时立即校验 initial givens 不变量。
- 查询方法和修改状态的方法严格区分。

这样到了 HW2，新增 Hint 和 Explore 时，大部分改动都会是“加能力”，而不是先修正 HW1 的状态模型。

### 这个设计牺牲了什么

当前设计并不是没有代价。为了让探索、分支和独立 history 都进入领域模型，`Game` 比 HW1 阶段更复杂了：它不仅管理主棋盘，还管理 Branch Map、当前分支、失败记忆、序列化校验和探索提交。对于只需要最小 Explore 功能的版本，一个简单 snapshot 会更短、更容易第一次看懂。

我认为这次复杂度是可以接受的，原因是它换来了更清楚的扩展边界：主局面和探索局面同形状，探索内 Undo / Redo 不需要特殊处理，树状分支也不需要重写状态模型。也就是说，这个设计牺牲的是“最小实现的简单度”，换来的是“功能演进时的稳定性”。

另一个牺牲是主 history 不记录探索树的完整过程。提交后只保留最终 `before / after` 和 moves 摘要，不能完整回放用户在探索中 fork 过哪些分支。我选择这样做，是因为主 history 的目标是支持清晰的 Undo / Redo，而不是成为搜索过程审计日志。

## 8. 当前完成度与测试

当前实现覆盖了作业要求中的核心功能：

- 候选提示。
- 下一步提示。
- 提示原因解释。
- 仅提示位置与直接填写答案的区分。
- 进入探索、提交探索、放弃探索。
- 探索失败检测：冲突和 dead-end。
- 探索失败记忆。
- 探索回到起点。
- 树状探索分支。
- 探索过程中的独立 Undo / Redo。
- 主历史保持线性。
- 序列化和反序列化探索状态。
- 初始题面 givens 不变量校验。

测试分为两组：

- `tests/hw1`：确保 HW1 的基础合同、克隆、Undo / Redo、序列化没有被 HW2 破坏。
- `tests/hw2`：覆盖 Hint、Explore、树状分支、探索内 Undo / Redo、失败记忆和边界情况。

当前完整测试结果：

```text
11 test files passed
44 tests passed
```
