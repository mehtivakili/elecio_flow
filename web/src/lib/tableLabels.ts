import { useEffect } from 'react';

/**
 * On phones every `.tbl` stacks into cards (see index.css). Each cell needs to
 * know its column name, so this copies the header text into `data-label` on
 * every body cell — for all tables, including ones rendered later in sheets.
 */
export function useTableLabels(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const label = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>('table.tbl:not(.tbl-keep)').forEach((table) => {
        const head = table.tHead?.rows[table.tHead.rows.length - 1];
        if (!head) return;
        const names: string[] = [];
        for (const th of Array.from(head.cells)) for (let i = 0; i < th.colSpan; i++) names.push(th.textContent?.trim() ?? '');
        for (const body of Array.from(table.tBodies)) {
          for (const row of Array.from(body.rows)) {
            let col = 0;
            for (const cell of Array.from(row.cells)) {
              const name = names[col] ?? '';
              if (cell.getAttribute('data-label') !== name) cell.setAttribute('data-label', name);
              col += cell.colSpan;
            }
          }
        }
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(label); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [enabled]);
}
