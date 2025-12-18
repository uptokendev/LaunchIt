/**
 * Sidebar Component
 * Responsive navigation sidebar that becomes a drawer on mobile/tablet
 */

import { X } from "lucide-react";
import logo from "@/assets/logo.png";
import AnimatedNav from "./ui/animated-nav";
import { SocialTooltip } from "./ui/social-media";
import { navItems, socialLinks } from "@/constants/navigation";

interface SidebarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const Sidebar = ({ mobileMenuOpen, setMobileMenuOpen }: SidebarProps) => {
  return (
    <>
      {/* Mobile/Tablet Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: Fixed, Mobile/Tablet: Drawer */}
      <aside className={`
        fixed top-4 bottom-4 w-64 bg-sidebar/95 backdrop-blur-md border border-sidebar-border/50 rounded-2xl flex flex-col shadow-2xl z-50 transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'left-4' : '-left-72'}
        lg:left-4 lg:translate-x-0
      `}>
        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 pl-4 flex items-center">
          <a href="/"><img src={logo} alt="Launchpad" className="h-12 md:h-16 w-auto" /></a>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto">
          <AnimatedNav options={navItems} />
        </nav>

        <div className="p-4 md:p-6 border-t border-sidebar-border/50 space-y-4">
          <SocialTooltip items={socialLinks} />
          <p className="text-xs text-muted-foreground mt-4 hidden md:block">© 2025 Launchpad. All rights reserved.</p>
        </div>
      </aside>
    </>
  );
};
