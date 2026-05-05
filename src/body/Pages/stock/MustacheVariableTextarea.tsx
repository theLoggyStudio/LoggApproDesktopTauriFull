import { useCallback, useMemo, useRef, useState } from "react";
import { Card, Input, List, Typography } from "antd";
import {
  STOCK_PRINT_TEMPLATE_VARIABLES,
  applyMustacheVariableAtCaret,
  findOpenMustacheContext,
  type StockPrintTemplateVariable,
} from "../../utils/stockPrintTemplateVariables";

const { Text } = Typography;

type Props = {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Variables supplémentaires (ex. clés extraites du modèle). */
  extraVariables?: StockPrintTemplateVariable[];
};

export function MustacheVariableTextarea({
  value,
  onChange,
  rows = 12,
  placeholder,
  disabled,
  extraVariables = [],
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);

  const ctx = useMemo(() => findOpenMustacheContext(value, caret), [value, caret]);

  const allVars = useMemo(() => {
    const byKey = new Map<string, StockPrintTemplateVariable>();
    for (const v of STOCK_PRINT_TEMPLATE_VARIABLES) byKey.set(v.key, v);
    for (const v of extraVariables) {
      if (!byKey.has(v.key)) byKey.set(v.key, v);
    }
    return [...byKey.values()];
  }, [extraVariables]);

  const filtered = useMemo(() => {
    const q = (ctx?.filter ?? "").trim().toLowerCase();
    if (!q) return allVars;
    return allVars.filter(
      (v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q) || (v.category ?? "").toLowerCase().includes(q),
    );
  }, [allVars, ctx?.filter]);

  const syncCaret = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? 0);
  }, []);

  const insertVar = useCallback(
    (key: string) => {
      const el = taRef.current;
      const cur = el?.selectionStart ?? caret;
      const applied = applyMustacheVariableAtCaret(value, cur, key);
      if (!applied) {
        const ins = `{{ ${key} }}`;
        const pos = cur;
        const next = value.slice(0, pos) + ins + value.slice(pos);
        onChange(next);
        requestAnimationFrame(() => {
          if (!taRef.current) return;
          taRef.current.focus();
          const at = pos + ins.length;
          taRef.current.setSelectionRange(at, at);
          setCaret(at);
        });
        return;
      }
      onChange(applied.next);
      requestAnimationFrame(() => {
        if (!taRef.current) return;
        taRef.current.focus();
        taRef.current.setSelectionRange(applied.nextCaret, applied.nextCaret);
        setCaret(applied.nextCaret);
      });
    },
    [value, caret, onChange],
  );

  return (
    <div style={{ position: "relative" }}>
      <Input.TextArea
        ref={taRef}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const t = e.target;
          setCaret(t.selectionStart ?? 0);
        }}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
      />
      {ctx && !disabled ? (
        <Card
          size="small"
          style={{
            marginTop: 8,
            maxHeight: 280,
            overflow: "auto",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
          title={
            <Text type="secondary">
              Variables <Text code>{"{{ }}"}</Text>
              {ctx.filter ? (
                <>
                  {" "}
                  — filtre : <Text code>{ctx.filter}</Text>
                </>
              ) : null}
            </Text>
          }
        >
          <List
            size="small"
            dataSource={filtered}
            locale={{ emptyText: "Aucune variable" }}
            renderItem={(item) => (
              <List.Item style={{ cursor: "pointer", padding: "6px 8px" }} onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(item.key)}>
                <div>
                  <Text strong>
                    <Text code>{item.key}</Text>
                  </Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.label}
                      {item.category ? ` · ${item.category}` : ""}
                    </Text>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </Card>
      ) : null}
    </div>
  );
}
