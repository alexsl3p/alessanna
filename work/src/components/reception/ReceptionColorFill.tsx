import { memo, useLayoutEffect, useRef } from "react";

/**
 * Staff colors carry meaning. Some mobile Force Dark implementations rewrite
 * CSS fills even when color-scheme is explicit. Paint the fill as canvas pixels
 * instead, keeping the normal DOM text, hit targets and CSS fallback intact.
 * The parent must be positioned, isolated and clip its rounded corners.
 */
export const ReceptionColorFill = memo(function ReceptionColorFill({
  color,
  striped = false,
}: {
  color: string;
  striped?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
  }, [color]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={1}
        height={1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        style={{ forcedColorAdjust: "none" }}
      />
      {striped && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ backgroundImage: "repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.12) 5px,rgba(0,0,0,0.12) 10px)" }}
        />
      )}
    </>
  );
});
