// Lightweight ambient declarations to satisfy TypeScript without full @types/node.
// Module shims (should not be necessary if packages installed, but help TS in constrained env)
declare const process: { env: Record<string, string | undefined> }
declare module 'tailwindcss';
declare module 'tailwindcss/defaultTheme';
declare module 'tailwind-merge';
declare module 'class-variance-authority';
declare module 'lucide-react';
declare module '@heroicons/react/24/outline';
declare module '@radix-ui/themes' {
	import * as React from 'react'
	export const Theme: React.FC<any>
	export const ThemePanel: React.FC<any>
}
