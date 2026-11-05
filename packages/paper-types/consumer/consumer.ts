import type { BlockBreakEvent, ItemStack, Player, World } from "@effectmc/paper-types";

declare const event: BlockBreakEvent;
declare const item: ItemStack;
declare const player: Player;
declare const world: World;

const block = event.getBlock();
const blockType = block.getType();
const blockX = block.getX();

const worldName: string = world.getName();
const playerName: string = player.getName();
const playerWorld: World = player.getWorld();
const playerLocation = player.getLocation();
const playerX: number = playerLocation.getX();

const itemAmount: number = item.getAmount();
const itemType = item.getType();

export const summary = {
  blockType,
  blockX,
  worldName,
  playerName,
  playerWorldName: playerWorld.getName(),
  playerX,
  itemAmount,
  itemType,
};
