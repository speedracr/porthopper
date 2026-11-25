import { useRef, useState, type ComponentProps } from "react";

// Adapted from the shadcn/ui Table component (MIT).
export function Table(props: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm" {...props} />
    </div>
  );
}

export function TableHeader(props: ComponentProps<"thead">) {
  return <thead className="bg-muted [&_tr]:border-b" {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}

export function TableRow(props: ComponentProps<"tr">) {
  return <tr className="border-b transition-colors hover:bg-muted/60 focus-within:bg-muted/60" {...props} />;
}

export function TableHead(props: ComponentProps<"th">) {
  return <th scope="col" className="h-11 whitespace-nowrap px-5 text-left align-middle font-medium text-muted-foreground" {...props} />;
}

export function TableCell(props: ComponentProps<"td">) {
  return <td className="h-14 whitespace-nowrap px-5 align-middle" {...props} />;
}

export function useTableWidths(initialWidths: number[]) {
  const [widths, setWidths] = useState(initialWidths);
  return {
    totalWidth: widths.reduce((total, width) => total + width, 0),
    column(index: number) {
      return {
        width: widths[index],
        onResize: (width: number) => setWidths((current) =>
          current.map((value, i) => i === index ? width : value),
        ),
      };
    },
  };
}

export function ResizableTableHead({ label, width, minWidth, onResize }: {
  label: string;
  width: number;
  minWidth: number;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);

  function resize(nextWidth: number) {
    onResize(Math.min(720, Math.max(minWidth, nextWidth)));
  }

  return (
    <TableHead style={{ width, position: "relative" }}>
      {label}
      <div
        role="separator"
        tabIndex={0}
        aria-label={`Resize ${label} column`}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={720}
        aria-valuenow={width}
        className="column-resizer"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) resize(drag.current.width + event.clientX - drag.current.x);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          resize(width + (event.key === "ArrowLeft" ? -10 : 10));
        }}
      />
    </TableHead>
  );
}
