import * as React from 'react';
import {Slot} from '@radix-ui/react-slot';
import {cva,type VariantProps} from 'class-variance-authority';
import {cn} from '@/lib/utils';
const buttonVariants=cva('inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm transition-colors focus-visible:outline focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none',{
 variants:{variant:{default:'bg-primary text-white hover:bg-blue-800',outline:'border border-slate-300 bg-white hover:bg-slate-50',ghost:'hover:bg-slate-100'},size:{default:'min-h-11 px-5',sm:'min-h-9 px-3',icon:'size-11'}},defaultVariants:{variant:'default',size:'default'}});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof buttonVariants>{asChild?:boolean}
export const Button=React.forwardRef<HTMLButtonElement,ButtonProps>(({className,variant,size,asChild,...props},ref)=>{const Component=asChild?Slot:'button';return <Component className={cn(buttonVariants({variant,size}),className)} ref={ref} {...props}/>;});
Button.displayName='Button';
export {buttonVariants};
