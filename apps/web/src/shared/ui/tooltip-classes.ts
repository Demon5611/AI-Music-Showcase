import { cn } from "@/lib/utils";

type TooltipSide = "top" | "bottom" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";
type TooltipSize = "default" | "lg";

const contentBase =
  "pointer-events-none absolute z-50 min-w-[11rem] max-w-[16rem] whitespace-normal rounded-md bg-slate-900 px-2 py-1.5 text-xs leading-snug text-slate-50 opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-focus-within:opacity-100";

const contentWide =
  "pointer-events-none absolute z-50 min-w-[11rem] max-w-[22rem] whitespace-normal rounded-md bg-slate-900 px-2.5 py-2 text-xs leading-relaxed text-slate-50 opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-focus-within:opacity-100";

const contentLarge =
  "pointer-events-none absolute z-50 min-w-[22rem] max-w-[44rem] whitespace-normal rounded-md bg-slate-900 px-3 py-2.5 text-sm leading-relaxed text-slate-50 opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-focus-within:opacity-100";

const placementMap: Record<TooltipSide, Record<TooltipAlign, string>> = {
  top: {
    center:
      "bottom-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0",
    start:
      "bottom-[calc(100%+0.375rem)] left-0 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0",
    end: "bottom-[calc(100%+0.375rem)] right-0 left-auto translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0",
  },
  bottom: {
    center:
      "top-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0",
    start:
      "top-[calc(100%+0.375rem)] left-0 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0",
    end: "top-[calc(100%+0.375rem)] right-0 left-auto -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0",
  },
  left: {
    center:
      "right-[calc(100%+0.375rem)] top-1/2 translate-x-1 -translate-y-1/2 group-hover:translate-x-0 group-focus-within:translate-x-0",
    start:
      "right-[calc(100%+0.375rem)] top-1/2 translate-x-1 -translate-y-1/2 group-hover:translate-x-0 group-focus-within:translate-x-0",
    end: "right-[calc(100%+0.375rem)] top-1/2 translate-x-1 -translate-y-1/2 group-hover:translate-x-0 group-focus-within:translate-x-0",
  },
  right: {
    center:
      "left-[calc(100%+0.375rem)] top-1/2 -translate-x-1 -translate-y-1/2 group-hover:translate-x-0 group-focus-within:translate-x-0",
    start:
      "left-[calc(100%+0.375rem)] top-1/2 -translate-x-1 -translate-y-1/2 group-hover:translate-x-0 group-focus-within:translate-x-0",
    end: "left-[calc(100%+0.375rem)] top-1/2 -translate-x-1 -translate-y-1/2 group-hover:translate-x-0 group-focus-within:translate-x-0",
  },
};

export const tt = {
  root: "group relative inline-flex max-w-full",
  rootBlock: "group relative block w-full max-w-full",
  trigger: "inline-flex max-w-full",
  triggerBlock: "block w-full max-w-full",
  contentBase,
  contentWide,
  contentLarge,
  placement: (
    side: TooltipSide,
    align: TooltipAlign,
    options: { wide?: boolean; size?: TooltipSize } = {},
  ) => {
    const { wide = false, size = "default" } = options;
    const contentClass =
      size === "lg" ? contentLarge : wide ? contentWide : contentBase;

    return cn(contentClass, placementMap[side][align]);
  },
} as const;

export type { TooltipAlign, TooltipSide, TooltipSize };
