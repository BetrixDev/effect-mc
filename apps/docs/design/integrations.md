---
title: Integrations
description: Soft-dependency packages and their optional Layers.
---

# Integrations

v0 core uses only Bukkit permissions. Soft-dependency packages come after the sample plugin.

Each package exports one `X.layer()`. If you import one without its Java plugin installed, you get a failure at provide or compile time through `R` requirements (Alchemy's provider pattern).

| Package | Provides | When |
| --- | --- | --- |
| `@effectmc/luckperms` | LuckPerms adapter Layer (not shaped by core) | After v0 |
| `@effectmc/vault` | Economy bridge | Later |
| `@effectmc/placeholderapi` | Expansion helpers | Later |
| `@effectmc/test` | Mock server plus optional headless Paper | With core |
