/**
 * Grid Background Component
 * Creates an interactive grid background that lights up squares on mouse hover
 * The grid automatically adjusts to window size and has random initial lit squares
 */

import { useState, useEffect, useRef } from "react";

export const GridBackground = () => {
  const [litSquares, setLitSquares] = useState<Set<string>>(new Set());
  const [gridDimensions, setGridDimensions] = useState({ cols: 20, rows: 20 });
  const squareSize = typeof window !== 'undefined' && window.innerWidth < 768 ? 40 : 80; // Smaller squares on mobile
  const gridRef = useRef<HTMLDivElement>(null);
  const lastKeyRef = useRef<string>("");


  useEffect(() => {
    const updateGridSize = () => {
      const availableWidth = window.innerWidth;
      const availableHeight = window.innerHeight;
      
      const cols = Math.ceil(availableWidth / squareSize) + 2;
      const rows = Math.ceil(availableHeight / squareSize) + 2;
      
      setGridDimensions({ cols, rows });
    };

    updateGridSize();
    window.addEventListener("resize", updateGridSize);
    return () => window.removeEventListener("resize", updateGridSize);
  }, [squareSize]);

  useEffect(() => {
    const initialLit = new Set<string>();
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const numInitialLit = Math.floor((gridDimensions.cols * gridDimensions.rows) / (isMobile ? 12 : 8)); // Fewer lit squares on mobile
    
    for (let i = 0; i < numInitialLit; i++) {
      const x = Math.floor(Math.random() * gridDimensions.cols);
      const y = Math.floor(Math.random() * gridDimensions.rows);
      initialLit.add(`${x}-${y}`);
    }
    
    setLitSquares(initialLit);
  }, [gridDimensions]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const gridX = Math.floor(x / squareSize);
      const gridY = Math.floor(y / squareSize);
      const key = `${gridX}-${gridY}`;

      if (
        gridX >= 0 &&
        gridX < gridDimensions.cols &&
        gridY >= 0 &&
        gridY < gridDimensions.rows &&
        key !== lastKeyRef.current
      ) {
        lastKeyRef.current = key;
        setLitSquares((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(key)) {
            newSet.delete(key);
          } else {
            newSet.add(key);
          }
          return newSet;
        });
      }
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, [gridDimensions, squareSize]);

  const gridStyle = {
    gridTemplateColumns: `repeat(${gridDimensions.cols}, ${squareSize}px)`,
    gridTemplateRows: `repeat(${gridDimensions.rows}, ${squareSize}px)`,
  };

  return (
    <>
      {/* Visual layer - behind all content */}
      <div className="fixed left-0 top-0 right-0 bottom-0 overflow-hidden pointer-events-none z-0">
        <div 
          ref={gridRef}
          className="absolute inset-0 grid"
          style={gridStyle}
        >
          {Array.from({ length: gridDimensions.cols * gridDimensions.rows }).map((_, index) => {
            const x = index % gridDimensions.cols;
            const y = Math.floor(index / gridDimensions.cols);
            const key = `${x}-${y}`;
            const isLit = litSquares.has(key);

            return (
              <div
                key={key}
                className="border border-border/30 transition-all duration-300"
                style={{
                  backgroundColor: isLit ? 'hsl(220 12% 75% / 0.2)' : 'transparent',
                  boxShadow: isLit ? '0 0 20px hsl(220 12% 75% / 0.35)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
};
