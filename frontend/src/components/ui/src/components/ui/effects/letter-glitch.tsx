/**
 * Letter Glitch Effect Component
 * Creates a canvas-based text glitch effect with animated characters and colors
 */

import React, { useEffect, useRef } from "react";

interface LetterGlitchProps {
  text?: string;
  glitchColors?: string[];
  glitchSpeed?: number;
  fontSize?: number;
  fontFamily?: string;
  className?: string;
}

const LetterGlitch: React.FC<LetterGlitchProps> = ({
  text = "PROCESSING",
  glitchColors = ["#a3e635", "#bef264", "#84cc16"],
  glitchSpeed = 50,
  fontSize = 48,
  fontFamily = "monospace",
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions
    ctx.font = `${fontSize}px ${fontFamily}`;
    const textWidth = ctx.measureText(text).width;
    canvas.width = textWidth + 40;
    canvas.height = fontSize * 1.5;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let frameCount = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px ${fontFamily}`;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const x = 20 + i * (textWidth / text.length);
        const y = canvas.height / 2 + fontSize / 3;

        // Randomize glitch effect
        if (Math.random() < 0.1 && frameCount % glitchSpeed === 0) {
          const glitchChar = chars[Math.floor(Math.random() * chars.length)];
          const color = glitchColors[Math.floor(Math.random() * glitchColors.length)];
          ctx.fillStyle = color;
          ctx.fillText(glitchChar, x + Math.random() * 4 - 2, y + Math.random() * 4 - 2);
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.fillText(char, x, y);
        }
      }

      frameCount++;
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [text, glitchColors, glitchSpeed, fontSize, fontFamily]);

  return <canvas ref={canvasRef} className={className} />;
};

export default LetterGlitch;
