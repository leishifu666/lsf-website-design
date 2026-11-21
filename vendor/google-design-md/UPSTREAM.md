# Google DESIGN.md 本地规范

[Google 官方仓库](https://github.com/google-labs-code/design.md)是唯一上游。[UPSTREAM.json](UPSTREAM.json)记录仓库地址、分支和同步范围，[快照清单](upstream/.snapshot.json)记录实际提交及每个文件的校验值。

- [完整官方规范](upstream/docs/spec.md)用于日常读取。YAML 格式、令牌、分组、章节和引用规则都保留上游原文。
- [规范 MDX 源文](upstream/packages/cli/src/linter/spec-gen/spec.mdx)、[结构定义 YAML](upstream/packages/cli/src/linter/spec-config.yaml)和生成器源文件保留上游目录结构。
- [官方 README](upstream/README.md)、[设计理念](upstream/PHILOSOPHY.md)和三个完整示例随快照保存。示例包括 [Atmospheric Glass](upstream/examples/atmospheric-glass/DESIGN.md)、[Paws & Paths](upstream/examples/paws-and-paths/DESIGN.md)和 [Totality Festival](upstream/examples/totality-festival/DESIGN.md)。
- [Apache-2.0 许可证](upstream/LICENSE)随原文分发。LSF 的使用步骤维护在 [J 模式指南](../../references/design-md.md)。

## 更新

在 `lsf-website-design` 目录运行。第一条会拉取上游、检查现有快照完整性并在有更新时替换副本。第二条刷新技能索引。

```sh
python -B scripts/sync-design-md.py --update
node scripts/resource-index.mjs
```

单独运行 `python -B scripts/sync-design-md.py` 可在离线状态核对本地副本的完整性。更新时遇到本地手改的上游文件会提示具体路径。需要扩充同步范围时修改 `UPSTREAM.json`，本地使用建议写进 J 模式指南。

本机代理无法连接 GitHub 时，用 `python -B scripts/sync-design-md.py --update --direct`。直连设置仅用于这一次拉取。
