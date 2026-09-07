import { assign, chunk, fill, groupBy, map, mapValues, sum, toPairs, values } from "lodash";
import { FormEvent, Fragment, useCallback, useMemo, useState } from "react";
import { DemoSave, UnknownEntity } from "../DemoSave";
import { IEditorPlugin } from "../IEditorPlugin";
import { StockpileUtil } from "../StockpileUtil";

export const StockpilePlugin: IEditorPlugin<DemoSave, DemoSave> = {
  id: "StockpilePlugin",
  name: "Manage stockpile inventories",
  group: "Storage",
  position: 20,
  enabled: true,

  read: (save) => save,
  write: (_, data) => data,

  Preview: ({ saveData }) => {
    const stockpiles = useMemo(() => StockpileUtil.getStockpiles(saveData), [saveData]);
    const allGoods = useMemo(() => stockpiles.reduce((acc, stockpile) => StockpileUtil.countGoods(stockpile, acc), {} as Record<string, number>), [stockpiles]);

    return <div>
      <StockpileInventoryTable counts={allGoods} />
    </div>
  },

  Editor: ({ initialData, onClose, onSubmit }) => {
    const [stockpileId, setStockpileId] = useState<string | null>(null);
    const [stockpiles, setStockpiles] = useState(() => StockpileUtil.getStockpiles(initialData));

    const setStockpile = useCallback((type: "self" | "all", stockpile: UnknownEntity) => {
      setStockpiles(stockpiles.map(target =>
        (type === "all" ? StockpileUtil.canApplyTo(stockpile, target) : target.Id === stockpile.Id)
          ? StockpileUtil.setGoods(target, StockpileUtil.countGoods(stockpile)) : target));
      setStockpileId(null);
    }, [setStockpiles, stockpiles, setStockpileId])

    const doSubmit = useCallback(() => {
      const mappedStockpiles = mapValues(groupBy(stockpiles, "Id"), (arr) => arr[0]);

      onSubmit({
        ...initialData,
        Entities: initialData.Entities.map((_) => mappedStockpiles[_.Id] ? mappedStockpiles[_.Id] : _),
      });
    }, [onSubmit, initialData, stockpiles]);

    return <div className="container my-4">
      <div className="card">
        <div className="card-body">
          <h1 className="card-title">Manage stockpile inventories</h1>
          <div className="d-flex">
            <button type="button" className="btn btn-primary" onClick={doSubmit}>Submit</button>
            <button type="button" className="btn btn-light ms-auto" onClick={onClose}>Discard changes</button>
          </div>
        </div>
        <div className="list-group list-group-flush">
          {stockpiles.map((stockpile) => stockpileId === stockpile.Id
            ? <StockpileForm key={stockpile.Id} setStockpile={setStockpile} stockpile={stockpile} />
            : <StockpileButton key={stockpile.Id} setStockpileId={setStockpileId} stockpile={stockpile} />)}
        </div>
      </div>
    </div>;
  }
}

function StockpileForm({ stockpile, setStockpile }: { stockpile: UnknownEntity, setStockpile: (type: "self" | "all", stockpile: UnknownEntity) => void }) {
  const goods = useMemo(() => StockpileUtil.getAllowedGoods(stockpile), [stockpile]);
  const [counts, setCounts] = useState(() => StockpileUtil.countGoods(stockpile));
  const [error, setError] = useState("");

  const onSubmit = useCallback((event: FormEvent) => {
    event.preventDefault();
    const type = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "all" ? "all" : "self";
    try { setStockpile(type, StockpileUtil.setGoods(stockpile, counts)); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }, [stockpile, setStockpile, counts]);

  const setCount = useCallback((good: string, count: number) => {
    setCounts({ ...counts, [good]: count });
  }, [setCounts, counts]);

  const totalCounts = sum(map(values(counts), _ => _ || 0));
  const capacity = StockpileUtil.getCapacity(stockpile);

  const fillToCapacity = useCallback((capacity: number) => {
    const initialMaxGood = Math.floor(capacity / goods.length);
    let remainder = capacity - initialMaxGood * goods.length; // Seems slightly faster than modulo
    const newCounts: Record<string, number> = {};
    goods.forEach((good: string) => {
      newCounts[good] = initialMaxGood + (remainder-- > 0 ? 1 : 0);
    });
    setCounts(newCounts);
  }, [goods]);

  return <div className="list-group-item">
    <div className="d-flex">
      <div>
        <b>{stockpile.Template}</b>
        <div style={{ whiteSpace: "nowrap" }}>
          x: <b>{Math.round(stockpile.Components.BlockObject.Coordinates.X)}</b>{" "}
          y: <b>{Math.round(stockpile.Components.BlockObject.Coordinates.Y)}</b>{" "}
          z: <b>{Math.round(stockpile.Components.BlockObject.Coordinates.Z)}</b>{" "}
        </div>
      </div>
      <form className="flex-fill" onSubmit={onSubmit}>
        {error && <p role="alert" className="text-danger">{error}</p>}
        {goods.length === 0 && <p>Select an allowed good in Timberborn before filling this storage.</p>}
        {goods.map((good) => <div key={good} className="row mb-3">
          <label htmlFor={`stock-${stockpile.Id}-${good}`} className="col-sm-2 col-form-label col-form-label-sm text-end">{good}</label>
          <div className="col-sm-10">
            <input id={`stock-${stockpile.Id}-${good}`} className="form-control form-control-sm" type="number"
              onChange={(event) => { setCount(good, event.target.valueAsNumber) }} min={0} step={1} required value={Number.isFinite(counts[good]) ? counts[good] : ""} />
          </div>
        </div>)}
        <div className="row">
          <div className="col-sm-10 offset-sm-2 d-flex">
            <button type="submit" name="submit" value="self" className="btn btn-primary btn-sm">OK</button>
            {capacity !== undefined && totalCounts > capacity
              ? <div className="text-danger p-1">Warning: <strong>{totalCounts}</strong> storage exceeds capacity of <strong>{capacity}</strong>!</div>
              : <div className="p-1"><strong>{totalCounts}</strong> / <strong>{capacity ?? "unknown capacity"}</strong></div>}
            <button
              disabled={capacity === undefined || goods.length === 0}
              className="ms-auto btn btn-secondary btn-sm"
              onClick={(e) => {
                e.preventDefault();
                if (capacity !== undefined) fillToCapacity(capacity);
              }}
            >
              Fill
            </button>
            <button type="submit" name="submit" value="all" className="ms-1 btn btn-danger btn-sm">Apply to matching storages</button>
          </div>
        </div>
      </form>
    </div>
  </div>
}

function StockpileButton({ stockpile, setStockpileId }: { stockpile: UnknownEntity, setStockpileId: (id: string) => void }) {
  return <button onClick={() => setStockpileId(stockpile.Id)} className="list-group-item list-group-item-action">
    <div className="d-flex">
      <div>
        <b>{stockpile.Template}</b>
        <div style={{ whiteSpace: "nowrap" }}>
          x: <b>{Math.round(stockpile.Components.BlockObject.Coordinates.X)}</b>{" "}
          y: <b>{Math.round(stockpile.Components.BlockObject.Coordinates.Y)}</b>{" "}
          z: <b>{Math.round(stockpile.Components.BlockObject.Coordinates.Z)}</b>{" "}
        </div>
      </div>
      <StockpileInventoryTable counts={StockpileUtil.countGoods(stockpile)} />
    </div>
  </button>;
}

function StockpileInventoryTable({ counts }: { counts: Record<string, number> }) {
  return <table className="table table-sm table-borderless my-0">
    <tbody>
      {chunk(toPairs(counts), 5).map((chunk, index) => <tr key={index}>
        {assign(fill(new Array(5), ["", ""]), chunk).map(([label, value], i) => <Fragment key={i}>
          <th style={{ width: "17%" }} className="text-end">{label}</th>
          <td style={{ width: "3%" }} className="text-end">{value}</td>
        </Fragment>)}
      </tr>)}
    </tbody>
  </table>;
}
