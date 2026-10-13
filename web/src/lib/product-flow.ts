import type { ProductFlowSection } from '@shared/defaults';

/** Separate production stations for the compact overview, retaining every custom item. */
export function compactProductFlow(sections: ProductFlowSection[]): ProductFlowSection[] {
  return sections.flatMap((section) => {
    if (section.id !== 'production') return [section];
    const software = section.subsections.filter((stage) => stage.id === 'software');
    const packing = section.subsections.filter((stage) => stage.id === 'packing');
    if (!software.length && !packing.length) return [section];
    const assembly = section.subsections.filter((stage) => !['software', 'packing'].includes(stage.id));
    return [
      ...(software.length ? [{ ...section, id: 'production-software', title: 'آماده‌سازی نرم‌افزار', subsections: software }] : []),
      ...(assembly.length ? [{ ...section, title: 'مونتاژ', subsections: assembly }] : []),
      ...(packing.length ? [{ ...section, id: 'production-packing', title: 'بسته‌بندی', subsections: packing }] : []),
    ];
  });
}

