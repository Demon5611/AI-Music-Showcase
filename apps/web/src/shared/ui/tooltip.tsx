"use client";

import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useOptionalHintsVisible } from "@/shared/providers/hints-visibility-provider";
import {
  tt,
  type TooltipAlign,
  type TooltipSide,
  type TooltipSize,
} from "@/shared/ui/tooltip-classes";

interface TooltipProps {
  content: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  block?: boolean;
  wide?: boolean;
  size?: TooltipSize;
  children: ReactElement | ReactNode;
}

export function Tooltip({
  content,
  side = "top",
  align = "center",
  block = false,
  wide = false,
  size = "default",
  children,
}: TooltipProps) {
  const hintsVisible = useOptionalHintsVisible();

  if (hintsVisible === false) {
    return children;
  }

  const rootClass = block ? tt.rootBlock : tt.root;
  const triggerClass = block ? tt.triggerBlock : tt.trigger;
  const contentClass = tt.placement(side, align, { wide, size });

  const RootTag = block ? "div" : "span";
  const TriggerTag = block ? "div" : "span";

  return (
    <RootTag className={rootClass}>
      <TriggerTag className={triggerClass}>{children}</TriggerTag>
      <span className={contentClass} role="tooltip">
        {content}
      </span>
    </RootTag>
  );
}

interface DisabledTooltipButtonProps {
  content: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  wide?: boolean;
  block?: boolean;
  size?: TooltipSize;
  children: ReactElement;
}

export function DisabledTooltipWrap({
  content,
  side = "top",
  align = "center",
  wide = false,
  block = false,
  size = "default",
  children,
}: DisabledTooltipButtonProps) {
  const hintsVisible = useOptionalHintsVisible();

  if (hintsVisible === false) {
    return children;
  }

  const TriggerTag = block ? "div" : "span";
  const triggerClass = block ? tt.triggerBlock : tt.trigger;

  return (
    <Tooltip align={align} block={block} content={content} side={side} size={size} wide={wide}>
      <TriggerTag className={triggerClass}>{children}</TriggerTag>
    </Tooltip>
  );
}
