"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";

const MULTIPLIERS = { million: 1_000_000, billion: 1_000_000_000 } as const;
type Unit = keyof typeof MULTIPLIERS;

/**
 * AUM figure + unit picker — the caller still just gets/sets a raw USD
 * string (same shape as before, e.g. "1000000000"), but the user types "1"
 * and picks "Billion" instead of typing nine zeros. `value` is reverse-split
 * into figure/unit whenever it changes from outside this component (initial
 * load, external reset) — while the user is actively typing, only their own
 * edits drive the displayed figure/unit.
 */
export function AumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (rawUsd: string) => void;
  placeholder?: string;
}) {
  const [figure, setFigure] = useState("");
  const [unit, setUnit] = useState<Unit>("billion");
  const lastEmitted = useRef<string>("");

  useEffect(() => {
    if (value === lastEmitted.current) return;
    if (!value) {
      setFigure("");
      lastEmitted.current = value;
      return;
    }
    const n = Number(value);
    if (Number.isNaN(n)) return;
    if (Math.abs(n) >= MULTIPLIERS.billion) {
      setUnit("billion");
      setFigure(String(n / MULTIPLIERS.billion));
    } else {
      setUnit("million");
      setFigure(String(n / MULTIPLIERS.million));
    }
    lastEmitted.current = value;
  }, [value]);

  function emit(nextFigure: string, nextUnit: Unit) {
    if (!nextFigure) {
      lastEmitted.current = "";
      onChange("");
      return;
    }
    const n = Number(nextFigure);
    if (Number.isNaN(n)) return;
    const raw = String(Math.round(n * MULTIPLIERS[nextUnit]));
    lastEmitted.current = raw;
    onChange(raw);
  }

  return (
    <div className="flex gap-1.5">
      <Input
        type="number"
        min="0"
        step="any"
        value={figure}
        onChange={(e) => {
          setFigure(e.target.value);
          emit(e.target.value, unit);
        }}
        placeholder={placeholder}
        className="flex-1"
      />
      <Select
        value={unit}
        onChange={(e) => {
          const nextUnit = e.target.value as Unit;
          setUnit(nextUnit);
          emit(figure, nextUnit);
        }}
        className="w-28"
      >
        <option value="million">Million</option>
        <option value="billion">Billion</option>
      </Select>
    </div>
  );
}
