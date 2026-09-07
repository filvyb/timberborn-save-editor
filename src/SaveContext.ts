import { createContext } from "react";
import type { DemoSave } from "./DemoSave";

export const SaveContext = createContext<{ saveData: DemoSave } | null>(null);
