"use client";

import type { ReactNode } from "react";
import { legal } from "@/features/legal/legal-classes";

type LegalSectionProps = {
  id: string;
  title: string;
  children: ReactNode;
};

export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section className={legal.section} aria-labelledby={id}>
      <h2 className={legal.sectionTitle} id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

type LegalParagraphsProps = {
  items: string[];
};

export function LegalParagraphs({ items }: LegalParagraphsProps) {
  return (
    <>
      {items.map((text, index) => (
        <p className={legal.paragraph} key={`p-${index}`}>
          {text}
        </p>
      ))}
    </>
  );
}

type LegalBulletListProps = {
  items: string[];
};

export function LegalBulletList({ items }: LegalBulletListProps) {
  return (
    <ul className={legal.list}>
      {items.map((text, index) => (
        <li key={`li-${index}`}>{text}</li>
      ))}
    </ul>
  );
}
