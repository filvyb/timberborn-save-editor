import { DemoSave, UnknownEntity } from "./DemoSave";

interface StockpileGoodsEntry {
  Good: string | { Id: string };
  Amount: number;
}

const stockpileTypes = [{
  id: "LargeWaterTank.Folktails",
  capacity: 300,
}, {
  id: "SmallWaterTank.Folktails",
  capacity: 30
}, {
  id: "SmallWarehouse.Folktails",
  capacity: 200,
}, {
  id: "SmallWarehouseNew.Folktails",
  capacity: 30,
}, {
  id: "LogPile.Folktails",
  capacity: 180,
}, {
  id: "UndergroundWarehouse.Folktails",
  capacity: 4000,
}, {
  id: "LargeWarehouse.Folktails",
  capacity: 1000,
}, {
  id: "SmallWarehouse.IronTeeth",
  capacity: 200,
}, {
  id: "SmallWarehouseNew.IronTeeth",
  capacity: 30,
}, {
  id: "SmallWaterTank.IronTeeth",
  capacity: 30,
}, {
  id: "LargeWaterTank.IronTeeth",
  capacity: 300,
}, {
  id: "IndustrialLogPile.IronTeeth",
  capacity: 180,
}, {
  id: "LargeWarehouse.IronTeeth",
  capacity: 1000,
}, {
  id: "MediumWarehouse.Folktails",
  capacity: 200
}, {
  id: "MediumWarehouse.IronTeeth",
  capacity: 200
}];

const modernCapacities: Record<string, number> = {
  SmallWarehouse: 30, MediumWarehouse: 200, LargeWarehouse: 1000,
  SmallTank: 30, MediumTank: 300, LargeTank: 1200,
  SmallPile: 20, LargePile: 180, UndergroundPile: 1800,
};
for (const faction of ["Folktails", "IronTeeth"]) {
  for (const [name, capacity] of Object.entries(modernCapacities)) {
    const id = `${name}.${faction}`;
    if (!stockpileTypes.some(type => type.id === id)) stockpileTypes.push({ id, capacity });
  }
}

const goodId = (good: string | { Id: string } | undefined): string | undefined => typeof good === "string" ? good : good?.Id;
const entries = (entity: UnknownEntity): StockpileGoodsEntry[] => entity.Components["Inventory:Stockpile"]?.Storage?.Goods ?? [];

export const StockpileUtil = {
  stockpileTypes,
  stockpileIds: stockpileTypes.map(type => type.id),
  goodId,
  getCapacity: (stockpile: UnknownEntity): number | undefined => {
    if (typeof stockpile.Components.SingleGoodAllower?.AllowedGood === "string") {
      return modernCapacities[stockpile.Template.split(".")[0]];
    }
    return stockpileTypes.find(type => type.id === stockpile.Template)?.capacity;
  },
  getStockpiles: (save: DemoSave) => save.Entities.filter(entity =>
    entity.Components.BlockObjectState?.Finished !== false && entity.Components.Constructible?.Finished !== false &&
    (entity.Components["Inventory:Stockpile"] ||
    (entity.Components.SingleGoodAllower && StockpileUtil.stockpileIds.includes(entity.Template)))),
  getAllowedGoods: (entity: UnknownEntity): string[] => {
    if (entity.Components.SingleGoodAllower) {
      const allowed = goodId(entity.Components.SingleGoodAllower.AllowedGood);
      return allowed ? [allowed] : [];
    }
    const desired = (entity.Components.GoodDesirer?.DesiredGoods ?? []).map((entry: StockpileGoodsEntry) => goodId(entry.Good));
    return [...new Set([...desired, ...entries(entity).map(entry => goodId(entry.Good))].filter((id): id is string => !!id))];
  },
  countGoods: (stockpile: UnknownEntity, accumulator: Record<string, number> = {}) => {
    const result = { ...accumulator };
    for (const { Good, Amount } of entries(stockpile)) {
      const id = goodId(Good);
      if (id) result[id] = (result[id] ?? 0) + Amount;
    }
    return result;
  },
  setGoods: (stockpile: UnknownEntity, counts: Record<string, number>): UnknownEntity => {
    const allowed = StockpileUtil.getAllowedGoods(stockpile);
    for (const [id, count] of Object.entries(counts)) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Inventory amounts must be non-negative whole numbers.");
      // Existing disallowed goods can remain while a storage is being emptied by the game.
      if (count > (StockpileUtil.countGoods(stockpile)[id] ?? 0) && !allowed.includes(id)) throw new Error(`This storage does not allow ${id}.`);
    }
    const capacity = StockpileUtil.getCapacity(stockpile);
    if (capacity !== undefined && Object.values(counts).reduce((a, b) => a + b, 0) > capacity) {
      throw new Error(`Inventory exceeds capacity (${capacity}).`);
    }
    const result = structuredClone(stockpile);
    const modern = typeof stockpile.Components.SingleGoodAllower?.AllowedGood === "string" || entries(stockpile).some(entry => typeof entry.Good === "string");
    const inventory = result.Components["Inventory:Stockpile"] ??= {};
    inventory.Storage ??= {};
    inventory.Storage.Goods = Object.entries(counts).filter(([, amount]) => amount > 0).map(([id, amount]) => {
      const existing = entries(stockpile).find(entry => goodId(entry.Good) === id);
      return { ...existing, Good: existing?.Good ?? (modern ? id : { Id: id }), Amount: amount };
    });
    return result;
  },
  canApplyTo: (source: UnknownEntity, target: UnknownEntity) => source.Template === target.Template &&
    JSON.stringify(StockpileUtil.getAllowedGoods(source).sort()) === JSON.stringify(StockpileUtil.getAllowedGoods(target).sort()),
};
