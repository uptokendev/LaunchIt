/**
 * Custom Loader Component
 * Renders a CSS-animated loading spinner
 */

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";

interface CustomLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

const CustomLoader: React.FC<CustomLoaderProps> = ({ className = "", size = "md" }) => {
  useEffect(() => {
    // Inject CSS if not already present
    if (!document.getElementById("custom-loader-styles")) {
      const style = document.createElement("style");
      style.id = "custom-loader-styles";
      style.textContent = `
.custom-loader-5{height:32px;width:32px;position:relative;animation:loader-5-1 2s cubic-bezier(0.770,0.000,0.175,1.000) infinite}
@keyframes loader-5-1{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.custom-loader-5::before,.custom-loader-5::after,.custom-loader-5 span::before,.custom-loader-5 span::after{
content:"";display:block;position:absolute;margin:auto;background:#ffffff;border-radius:50%}
.custom-loader-5::before{top:0;left:0;bottom:0;right:auto;width:8px;height:8px;animation:loader-5-2 2s cubic-bezier(0.770,0.000,0.175,1.000) infinite}
@keyframes loader-5-2{0%{transform:translate3d(0,0,0)scale(1)}50%{transform:translate3d(24px,0,0)scale(.5)}100%{transform:translate3d(0,0,0)scale(1)}}
.custom-loader-5::after{top:0;left:auto;bottom:0;right:0;width:8px;height:8px;animation:loader-5-3 2s cubic-bezier(0.770,0.000,0.175,1.000) infinite}
@keyframes loader-5-3{0%{transform:translate3d(0,0,0)scale(1)}50%{transform:translate3d(-24px,0,0)scale(.5)}100%{transform:translate3d(0,0,0)scale(1)}}
.custom-loader-5 span::before{top:0;left:0;bottom:auto;right:0;width:8px;height:8px;animation:loader-5-4 2s cubic-bezier(0.770,0.000,0.175,1.000) infinite}
@keyframes loader-5-4{0%{transform:translate3d(0,0,0)scale(1)}50%{transform:translate3d(0,24px,0)scale(.5)}100%{transform:translate3d(0,0,0)scale(1)}}
.custom-loader-5 span::after{top:auto;left:0;bottom:0;right:0;width:8px;height:8px;animation:loader-5-5 2s cubic-bezier(0.770,0.000,0.175,1.000) infinite}
@keyframes loader-5-5{0%{transform:translate3d(0,0,0)scale(1)}50%{transform:translate3d(0,-24px,0)scale(.5)}100%{transform:translate3d(0,0,0)scale(1)}}
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div className={cn("custom-loader-5", sizeMap[size], className)}>
      <span></span>
    </div>
  );
};

export default CustomLoader;
