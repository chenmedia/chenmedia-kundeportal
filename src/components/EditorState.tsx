"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface EditorState { dirty: boolean; setDirty: (v: boolean) => void }
const Ctx = createContext<EditorState>({ dirty: false, setDirty: () => {} });

/** Lar utkastredigering og publiseringspanelet (søsken i siden) dele om det finnes ulagrede endringer. */
export function EditorStateProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useEditorState = () => useContext(Ctx);
